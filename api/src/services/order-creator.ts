import { randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  orderItems,
  orders,
  priceTiers,
  products,
  productVariants,
  promotionItems,
  promotions,
  type OptionType,
  type VariantOptions,
} from "../db/schema.ts";
import { addCents, fromCents, multiplyCents, subtractCents, toCents, ZERO } from "../lib/money.ts";
import type { Cents } from "../lib/money.ts";
import { applyCoupon, incrementCouponUsage } from "./coupon-applier.ts";
import { findOrCreateForOrder, normalizePhone, refreshStats } from "./customers.ts";
import {
  comboAvailable,
  contentsLabel,
  hasVariants,
  isService,
  productAvailable,
  unitPriceForProduct,
  unitPriceForVariant,
  variantAvailable,
  variantLabel,
  type PricedProduct,
  type PricedVariant,
  type TierRow,
} from "./pricing.ts";

/**
 * Port of backend/app/services/order_creator.rb — the one place an order comes
 * into existence, for both the storefront checkout and the admin's manual entry.
 *
 * The rule that shapes everything here: **prices sent by the client are
 * ignored**. Quantities and product ids are the only thing taken from the
 * request; every price is re-read from the database inside the transaction and
 * then frozen onto the order line, so a tampered cart cannot buy at its own
 * price and a later catalog edit cannot rewrite a past order.
 */

export const MAX_ITEMS = 50;
export const MAX_QUANTITY_PER_ITEM = 999;

export type CheckoutItem = {
  product_id?: number | string | null;
  variant_id?: number | string | null;
  promotion_id?: number | string | null;
  quantity?: number | string | null;
};

export type CheckoutCustomer = {
  customer_name: string;
  phone: string;
  // Required by the storefront checkout, optional for the admin's own order
  // form — see validateCustomer, which only checks its format here. Presence
  // is a route-level policy, not a service-level one.
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  payment_method: string;
  delivery_method: string;
};

export type OrderCreatorResult =
  | { success: true; orderId: number; errors: [] }
  | { success: false; orderId: null; errors: string[] };

type ProductKey = string;

const keyOf = (productId: number, variantId: number | null): ProductKey =>
  `${productId}:${variantId ?? ""}`;

function toId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toQuantity(value: unknown): number {
  const parsed = Number(value ?? 1);
  if (!Number.isFinite(parsed)) return 0;
  return Math.floor(parsed);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Normalisation
 * ──────────────────────────────────────────────────────────────────────────── */

export type NormalizedLine = { productId: number; variantId: number | null; quantity: number };

/**
 * Merges duplicate lines. Adding 3 units and then 3 more must count as 6 for
 * the wholesale ladder, not as two lines of 3 that each miss the tier.
 */
export function normalizeItems(items: CheckoutItem[]): NormalizedLine[] {
  const merged = new Map<ProductKey, NormalizedLine>();

  for (const item of items ?? []) {
    // Combo lines are handled separately.
    if (toId(item.promotion_id) !== null) continue;

    const productId = toId(item.product_id);
    if (productId === null) continue;

    const quantity = toQuantity(item.quantity);
    if (quantity <= 0) continue;

    const variantId = toId(item.variant_id);
    const key = keyOf(productId, variantId);
    const existing = merged.get(key);

    if (existing) {
      existing.quantity = Math.min(existing.quantity + quantity, MAX_QUANTITY_PER_ITEM);
    } else {
      merged.set(key, {
        productId,
        variantId,
        quantity: Math.min(quantity, MAX_QUANTITY_PER_ITEM),
      });
    }
  }

  return [...merged.values()];
}

export function normalizePromotions(items: CheckoutItem[]): Map<number, number> {
  const merged = new Map<number, number>();

  for (const item of items ?? []) {
    const promotionId = toId(item.promotion_id);
    if (promotionId === null) continue;

    const quantity = toQuantity(item.quantity);
    if (quantity <= 0) continue;

    merged.set(
      promotionId,
      Math.min((merged.get(promotionId) ?? 0) + quantity, MAX_QUANTITY_PER_ITEM),
    );
  }

  return merged;
}

/**
 * Total units demanded per product across the whole cart, **including what the
 * combos consume**. Without this a standalone line and a combo can each claim
 * the last unit in stock and both succeed.
 */
export function productDemand(
  lines: NormalizedLine[],
  combos: Map<number, number>,
  comboContents: Map<number, Array<{ productId: number; quantity: number }>>,
): Map<number, number> {
  const demand = new Map<number, number>();

  for (const line of lines) {
    demand.set(line.productId, (demand.get(line.productId) ?? 0) + line.quantity);
  }

  for (const [promotionId, comboQuantity] of combos) {
    for (const item of comboContents.get(promotionId) ?? []) {
      demand.set(
        item.productId,
        (demand.get(item.productId) ?? 0) + item.quantity * comboQuantity,
      );
    }
  }

  return demand;
}

/**
 * Quantities that select a price tier: summed per product across its variants,
 * so 5 in size S and 5 in size M reach the "from 10" tier together.
 *
 * Combos are deliberately excluded — a combo already carries its own discount,
 * and letting it push a standalone line into a cheaper tier discounts twice.
 */
export function tierQuantities(lines: NormalizedLine[]): Map<number, number> {
  const ladder = new Map<number, number>();
  for (const line of lines) {
    ladder.set(line.productId, (ladder.get(line.productId) ?? 0) + line.quantity);
  }
  return ladder;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Loading
 * ──────────────────────────────────────────────────────────────────────────── */

type LoadedProduct = PricedProduct & { name: string; tiers: TierRow[]; variants: PricedVariant[] };

type LoadedCombo = {
  id: number;
  name: string;
  price: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  items: Array<{ productId: number; quantity: number; product: LoadedProduct | null }>;
};

async function loadProducts(ids: number[]): Promise<Map<number, LoadedProduct>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.active, true)));

  if (rows.length === 0) return new Map();

  const loadedIds = rows.map((row) => row.id);
  const [tierRows, variantRows] = await Promise.all([
    db.select().from(priceTiers).where(inArray(priceTiers.productId, loadedIds)),
    db.select().from(productVariants).where(inArray(productVariants.productId, loadedIds)),
  ]);

  const byId = new Map<number, LoadedProduct>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      price: row.price,
      active: row.active,
      kind: row.kind,
      stock: row.stock,
      optionTypes: (row.optionTypes ?? []) as OptionType[],
      tiers: [],
      variants: [],
    });
  }

  for (const tier of tierRows) {
    byId.get(tier.productId)?.tiers.push({
      minQuantity: tier.minQuantity,
      unitPrice: tier.unitPrice,
    });
  }

  for (const variant of variantRows) {
    byId.get(variant.productId)?.variants.push({
      id: variant.id,
      productId: variant.productId,
      options: (variant.options ?? {}) as VariantOptions,
      price: variant.price,
      stock: variant.stock,
    });
  }

  return byId;
}

async function loadCombos(ids: number[]): Promise<Map<number, LoadedCombo>> {
  if (ids.length === 0) return new Map();

  const rows = await db.select().from(promotions).where(inArray(promotions.id, ids));
  if (rows.length === 0) return new Map();

  const itemRows = await db
    .select()
    .from(promotionItems)
    .where(inArray(promotionItems.promotionId, rows.map((row) => row.id)))
    .orderBy(promotionItems.position, promotionItems.id);

  const componentProducts = await loadProducts([
    ...new Set(itemRows.map((item) => item.productId)),
  ]);

  const byId = new Map<number, LoadedCombo>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      price: row.price,
      active: row.active,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      items: [],
    });
  }

  for (const item of itemRows) {
    byId.get(item.promotionId)?.items.push({
      productId: item.productId,
      quantity: item.quantity,
      product: componentProducts.get(item.productId) ?? null,
    });
  }

  return byId;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Validation
 * ──────────────────────────────────────────────────────────────────────────── */

function findVariant(product: LoadedProduct, variantId: number | null): PricedVariant | null {
  if (variantId === null) return null;
  return product.variants.find((variant) => variant.id === variantId) ?? null;
}

function validateAvailability(
  lines: NormalizedLine[],
  loaded: Map<number, LoadedProduct>,
  demand: Map<number, number>,
): string[] {
  const errors: string[] = [];

  for (const line of lines) {
    const product = loaded.get(line.productId);
    if (!product) {
      errors.push("Uno de los productos ya no está disponible");
      continue;
    }

    if (hasVariants(product)) {
      const variant = findVariant(product, line.variantId);
      if (!variant) {
        errors.push(`Elige una opción de ${product.name}`);
        continue;
      }
      // Variant stock is checked per line: two sizes of the same shirt draw
      // from different stock, so the merged product demand does not apply.
      if (!variantAvailable(variant, product, line.quantity)) {
        errors.push(
          `No hay suficiente stock de ${product.name} (${variantLabel(product, variant.options)})`,
        );
      }
      continue;
    }

    // A stale variant_id on a product that no longer has variants is ignored
    // rather than rejected — the cart lives in the buyer's browser for days.
    if (!productAvailable(product, product.variants, demand.get(product.id) ?? line.quantity)) {
      errors.push(`No hay suficiente stock de ${product.name}`);
    }
  }

  return errors;
}

function validatePromotions(
  combos: Map<number, number>,
  loaded: Map<number, LoadedCombo>,
  demand: Map<number, number>,
  now: Date,
): string[] {
  const errors: string[] = [];

  for (const [promotionId, quantity] of combos) {
    const combo = loaded.get(promotionId);
    if (!combo || !comboAvailable(combo, combo.items, quantity, now)) {
      errors.push("El combo que tenías en el carrito ya no está disponible");
      continue;
    }

    for (const item of combo.items) {
      const product = item.product;
      if (!product || isService(product) || product.stock === null) continue;
      if (product.stock < (demand.get(product.id) ?? 0)) {
        errors.push(`No hay suficiente stock para el combo ${combo.name}`);
        break;
      }
    }
  }

  return errors;
}

/**
 * Services are intangible: there is nothing to deliver and nothing to hand
 * cash to. The rule only fires when the whole cart is services — a cart that
 * mixes them with physical goods is a normal delivery.
 */
function validateServiceCheckout(
  customer: CheckoutCustomer,
  lines: NormalizedLine[],
  combos: Map<number, number>,
  loadedProducts: Map<number, LoadedProduct>,
  loadedCombos: Map<number, LoadedCombo>,
): string[] {
  const checkoutProducts: LoadedProduct[] = [];

  for (const line of lines) {
    const product = loadedProducts.get(line.productId);
    if (product) checkoutProducts.push(product);
  }
  for (const promotionId of combos.keys()) {
    for (const item of loadedCombos.get(promotionId)?.items ?? []) {
      if (item.product) checkoutProducts.push(item.product);
    }
  }

  if (checkoutProducts.length === 0) return [];
  if (!checkoutProducts.every((product) => isService(product))) return [];

  const errors: string[] = [];
  if (customer.payment_method !== "transferencia") {
    errors.push("Los servicios solo aceptan pago por transferencia bancaria");
  }
  if (customer.delivery_method !== "retiro") {
    errors.push("Los servicios no requieren dirección de entrega");
  }
  return errors;
}

function validateCustomer(customer: CheckoutCustomer): string[] {
  const errors: string[] = [];

  if (!customer.customer_name?.trim()) {
    errors.push("El nombre del cliente es requerido");
  } else if (customer.customer_name.trim().length > 120) {
    errors.push("El nombre del cliente es demasiado largo");
  }

  if (!customer.phone?.trim()) {
    errors.push("El teléfono es requerido");
  } else if (!/^\+?[\d\s-]{7,20}$/.test(customer.phone.trim())) {
    errors.push("El teléfono no tiene un formato válido");
  }

  // Presence is enforced by the caller (the public checkout requires it, the
  // admin's manual order entry does not) — this only guards the shape, the
  // same split phone/address already use.
  if (customer.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
    errors.push("El correo electrónico no tiene un formato válido");
  }

  if (!["efectivo", "transferencia"].includes(customer.payment_method)) {
    errors.push("El método de pago no es válido");
  }
  if (!["domicilio", "retiro"].includes(customer.delivery_method)) {
    errors.push("El método de entrega no es válido");
  }
  if (customer.delivery_method === "domicilio" && !customer.address?.trim()) {
    errors.push("La dirección es requerida para envíos a domicilio");
  }
  if ((customer.notes ?? "").length > 1000) {
    errors.push("Las notas son demasiado largas");
  }

  return errors;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Entry points
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Subtotal preview for POST /public/coupons/validate. Prices both standalone
 * products and combos so a cart full of promotions still shows the right
 * discount. Deliberately ignores stock and the services rule — it only needs
 * to price what is priced.
 */
export async function previewSubtotal(items: CheckoutItem[]): Promise<Cents> {
  const lines = normalizeItems(items);
  const combos = normalizePromotions(items);

  const [loadedProducts, loadedCombos] = await Promise.all([
    loadProducts([...new Set(lines.map((line) => line.productId))]),
    loadCombos([...combos.keys()]),
  ]);

  const ladder = tierQuantities(lines);

  let subtotal: Cents = ZERO;
  for (const line of lines) {
    const product = loadedProducts.get(line.productId);
    if (!product) continue;

    const variant = findVariant(product, line.variantId);
    const unitPrice = variant
      ? unitPriceForVariant(variant, product, product.tiers, ladder.get(product.id) ?? line.quantity)
      : unitPriceForProduct(product, product.tiers, ladder.get(product.id) ?? line.quantity);

    subtotal = addCents(subtotal, multiplyCents(unitPrice, line.quantity));
  }

  for (const [promotionId, quantity] of combos) {
    const combo = loadedCombos.get(promotionId);
    if (!combo) continue;
    subtotal = addCents(subtotal, multiplyCents(toCents(combo.price), quantity));
  }

  return subtotal;
}

export async function createOrder(input: {
  customer: CheckoutCustomer;
  items: CheckoutItem[];
  couponCode?: string | null;
  now?: Date;
}): Promise<OrderCreatorResult> {
  const now = input.now ?? new Date();

  const lines = normalizeItems(input.items);
  const combos = normalizePromotions(input.items);

  if (lines.length === 0 && combos.size === 0) {
    return { success: false, orderId: null, errors: ["El carrito está vacío"] };
  }
  if (lines.length + combos.size > MAX_ITEMS) {
    return {
      success: false,
      orderId: null,
      errors: [`El pedido no puede tener más de ${MAX_ITEMS} productos distintos`],
    };
  }

  const [loadedProducts, loadedCombos] = await Promise.all([
    loadProducts([...new Set(lines.map((line) => line.productId))]),
    loadCombos([...combos.keys()]),
  ]);

  const comboContents = new Map(
    [...loadedCombos.values()].map((combo) => [
      combo.id,
      combo.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    ]),
  );
  const demand = productDemand(lines, combos, comboContents);

  const errors = [
    ...validateAvailability(lines, loadedProducts, demand),
    ...validatePromotions(combos, loadedCombos, demand, now),
    ...validateServiceCheckout(input.customer, lines, combos, loadedProducts, loadedCombos),
    ...validateCustomer(input.customer),
  ];

  const unique = [...new Set(errors)];
  if (unique.length > 0) return { success: false, orderId: null, errors: unique };

  const ladder = tierQuantities(lines);

  try {
    const orderId = await db.transaction(async (tx) => {
      type PendingItem = typeof orderItems.$inferInsert;
      const pending: Omit<PendingItem, "orderId">[] = [];
      let subtotal: Cents = ZERO;

      for (const line of lines) {
        const product = loadedProducts.get(line.productId)!;
        const variant = findVariant(product, line.variantId);
        const quantityForTier = ladder.get(product.id) ?? line.quantity;

        const unitPrice = variant
          ? unitPriceForVariant(variant, product, product.tiers, quantityForTier)
          : unitPriceForProduct(product, product.tiers, quantityForTier);
        const lineSubtotal = multiplyCents(unitPrice, line.quantity);
        subtotal = addCents(subtotal, lineSubtotal);

        pending.push({
          productId: product.id,
          productVariantId: variant?.id ?? null,
          promotionId: null,
          productName: product.name,
          variantLabel: variant ? variantLabel(product, variant.options) : null,
          details: null,
          quantity: line.quantity,
          unitPrice: fromCents(unitPrice),
          subtotal: fromCents(lineSubtotal),
        });
      }

      for (const [promotionId, quantity] of combos) {
        const combo = loadedCombos.get(promotionId)!;
        // One line at the combo price. No ladder: the combo price *is* the
        // discount, and it carries no product_id — its parts are in `details`.
        const unitCents = toCents(combo.price);
        const lineSubtotal = multiplyCents(unitCents, quantity);
        subtotal = addCents(subtotal, lineSubtotal);

        pending.push({
          productId: null,
          productVariantId: null,
          promotionId: combo.id,
          productName: combo.name,
          variantLabel: null,
          details: contentsLabel(combo.items.map((item) => ({
            quantity: item.quantity,
            product: item.product,
          }))),
          quantity,
          unitPrice: fromCents(unitCents),
          subtotal: fromCents(lineSubtotal),
        });
      }

      const coupon = await applyCoupon(
        { code: input.couponCode, subtotal, lock: true, at: now },
        tx,
      );
      if (coupon.error) throw new OrderRollback([coupon.error]);

      const total = subtractCents(subtotal, coupon.discountAmount);

      const customer = await findOrCreateForOrder(
        {
          name: input.customer.customer_name,
          phone: input.customer.phone,
          email: input.customer.email,
          address: input.customer.address,
          city: input.customer.city,
        },
        tx,
      );

      const [order] = await tx
        .insert(orders)
        .values({
          customerName: input.customer.customer_name.trim(),
          phone: normalizePhone(input.customer.phone),
          email: input.customer.email?.trim() || null,
          address: input.customer.address?.trim() || null,
          city: input.customer.city?.trim() || null,
          notes: input.customer.notes?.trim() || null,
          paymentMethod: input.customer.payment_method,
          deliveryMethod: input.customer.delivery_method,
          status: "pendiente",
          subtotal: fromCents(subtotal),
          discountAmount: fromCents(coupon.discountAmount),
          total: fromCents(total),
          couponId: coupon.coupon?.id ?? null,
          customerId: customer?.id ?? null,
          publicToken: randomBytes(24).toString("base64url"),
        })
        .returning({ id: orders.id });

      const orderId = order!.id;

      // Rails derived the number from the id in an after_create hook; same
      // here, one statement later inside the same transaction.
      await tx
        .update(orders)
        .set({ number: sql`'RY-' || lpad(${orderId}::text, 5, '0')` })
        .where(eq(orders.id, orderId));

      await tx.insert(orderItems).values(pending.map((item) => ({ ...item, orderId })));

      if (coupon.coupon) await incrementCouponUsage(coupon.coupon.id, tx);

      await decrementStock(tx, lines, loadedProducts);
      await decrementComboStock(tx, combos, loadedCombos);

      if (customer) await refreshStats(customer.id, tx);

      return orderId;
    });

    return { success: true, orderId, errors: [] };
  } catch (error) {
    if (error instanceof OrderRollback) {
      return { success: false, orderId: null, errors: error.errors };
    }
    throw error;
  }
}

/** Thrown to roll the transaction back with messages the caller can render. */
class OrderRollback extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join(", "));
    this.name = "OrderRollback";
    this.errors = errors;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Uses a bare UPDATE with GREATEST rather than read-modify-write, so two
 * concurrent checkouts cannot both read the same stock and each subtract from
 * it. Untracked stock (NULL) and services are skipped.
 */
async function decrementStock(
  tx: Tx,
  lines: NormalizedLine[],
  loaded: Map<number, LoadedProduct>,
): Promise<void> {
  for (const line of lines) {
    const product = loaded.get(line.productId);
    if (!product || isService(product)) continue;

    const variant = findVariant(product, line.variantId);
    if (variant) {
      if (variant.stock === null) continue;
      await tx
        .update(productVariants)
        .set({
          stock: sql`greatest(${productVariants.stock} - ${line.quantity}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, variant.id));
      continue;
    }

    if (product.stock === null) continue;
    await tx
      .update(products)
      .set({
        stock: sql`greatest(${products.stock} - ${line.quantity}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(products.id, product.id));
  }
}

/**
 * A combo draws down each component's stock. The SQL-side subtraction matters
 * here too: the same product may already have been decremented by its own
 * standalone line a few statements ago.
 */
async function decrementComboStock(
  tx: Tx,
  combos: Map<number, number>,
  loaded: Map<number, LoadedCombo>,
): Promise<void> {
  for (const [promotionId, comboQuantity] of combos) {
    const combo = loaded.get(promotionId);
    if (!combo) continue;

    for (const item of combo.items) {
      const product = item.product;
      if (!product || isService(product) || product.stock === null) continue;

      const units = item.quantity * comboQuantity;
      await tx
        .update(products)
        .set({ stock: sql`greatest(${products.stock} - ${units}, 0)`, updatedAt: new Date() })
        .where(eq(products.id, product.id));
    }
  }
}
