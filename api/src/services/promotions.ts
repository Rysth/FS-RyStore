import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import type { Database } from "../db/client.ts";
import { productImages, products, promotionItems, promotions } from "../db/schema.ts";
import type { OptionType, Product, Promotion, PromotionItem } from "../db/schema.ts";
import { fromCents, toCents, ZERO } from "../lib/money.ts";
import { assetUrl } from "../lib/serializers.ts";
import { uniqueSlug } from "../lib/slug.ts";
import {
  availableUnits,
  contentsLabel,
  discountPercent,
  hasVariants,
  isLive,
  isSellable,
  regularTotal,
  savings,
} from "./pricing.ts";
import type { ComboItem } from "./pricing.ts";

/**
 * Port of backend/app/models/promotion.rb and PromotionsController's data access.
 *
 * A combo is several *different* products sold together at one price. It is an
 * extra way to buy, not a replacement for the catalog: the buyer can still add
 * each product on its own.
 */

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const MIN_ITEMS = 2;
export const MAX_ITEMS = 6;
export const MAX_ITEM_QUANTITY = 99;
export const MAX_NAME_LENGTH = 80;
export const MAX_DESCRIPTION_LENGTH = 600;

export type PromotionRecord = {
  promotion: Promotion;
  items: Array<PromotionItem & { product: Product | null; productImageKey: string | null }>;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Items
 * ──────────────────────────────────────────────────────────────────────────── */

export type ItemInput = { product_id?: unknown; quantity?: unknown };
export type NormalizedItem = { productId: number; quantity: number; position: number };

/**
 * Two rows naming the same product are the shop adding it twice, not a request
 * for two lines — the last one wins, which is also what the unique index says.
 */
export function normalizeItems(input: ItemInput[]): NormalizedItem[] {
  const byProduct = new Map<number, NormalizedItem>();

  for (const row of input) {
    const productId = Number(row.product_id);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    const quantity =
      row.quantity === null || row.quantity === undefined || String(row.quantity).trim() === ""
        ? 1
        : Number(row.quantity);
    byProduct.set(productId, { productId, quantity, position: 0 });
  }

  return [...byProduct.values()].map((item, position) => ({ ...item, position }));
}

export function validateItems(
  items: NormalizedItem[],
  catalog: Map<number, Product>,
  price: string,
): string[] {
  const errors: string[] = [];

  if (items.length < MIN_ITEMS) {
    return [`Un combo necesita al menos ${MIN_ITEMS} productos`];
  }
  if (items.length > MAX_ITEMS) {
    errors.push(`Un combo no puede tener más de ${MAX_ITEMS} productos`);
  }
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_ITEM_QUANTITY)) {
    errors.push(`La cantidad de cada producto debe estar entre 1 y ${MAX_ITEM_QUANTITY}`);
  }

  const resolved = items.map((item) => catalog.get(item.productId) ?? null);
  if (resolved.some((product) => product === null)) {
    errors.push("Uno de los productos del combo ya no existe");
    return errors;
  }

  // A combo of "Camiseta" cannot be added to a cart without saying which size,
  // and a combo card has nowhere to ask. Keeping variant products out is what
  // lets the buyer press one button.
  const varying = resolved.filter((product) =>
    hasVariants({ optionTypes: (product!.optionTypes ?? []) as OptionType[] }),
  );
  if (varying.length > 0) {
    errors.push(
      `${toSentence(varying.map((product) => product!.name))} tiene variantes y no puede formar parte de un combo`,
    );
  }

  const regular = regularTotal(
    items.map((item) => ({
      quantity: item.quantity,
      product: { ...toPriced(catalog.get(item.productId)!), name: catalog.get(item.productId)!.name },
    })),
  );
  if (regular > ZERO && toCents(price) > regular) {
    errors.push("El precio del combo no puede ser mayor a la suma de sus productos");
  }

  return errors;
}

/** Rails' `to_sentence`, Spanish: "A, B y C". */
function toSentence(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export type PromotionAttributes = {
  name?: string;
  description?: string | null;
  price?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

export function validatePromotion(attributes: PromotionAttributes): string[] {
  const errors: string[] = [];

  if (attributes.name !== undefined) {
    if (!attributes.name.trim()) errors.push("El nombre es requerido");
    else if (attributes.name.length > MAX_NAME_LENGTH) {
      errors.push(`El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres`);
    }
  }

  if (attributes.price !== undefined && toCents(attributes.price) < ZERO) {
    errors.push("El precio debe ser mayor o igual a 0");
  }

  if (attributes.description && attributes.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`La descripción no puede tener más de ${MAX_DESCRIPTION_LENGTH} caracteres`);
  }

  if (attributes.startsAt && attributes.endsAt && attributes.endsAt <= attributes.startsAt) {
    errors.push("La fecha de fin debe ser posterior a la fecha de inicio");
  }

  return errors;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Persistence
 * ──────────────────────────────────────────────────────────────────────────── */

export async function slugForPromotion(name: string, currentId?: number): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const [row] = await db
      .select({ id: promotions.id })
      .from(promotions)
      .where(
        currentId
          ? and(eq(promotions.slug, candidate), ne(promotions.id, currentId))
          : eq(promotions.slug, candidate),
      )
      .limit(1);
    return Boolean(row);
  });
}

/** Rails assigned `max(position) + 1` in a before_create hook. */
export async function nextPosition(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${promotions.position}), 0)::int` })
    .from(promotions);
  return (row?.max ?? 0) + 1;
}

export async function loadCatalog(ids: number[]): Promise<Map<number, Product>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  return new Map(rows.map((row) => [row.id, row]));
}

export async function listPromotions(filters: { active?: boolean } = {}): Promise<PromotionRecord[]> {
  const base = db.select().from(promotions).orderBy(asc(promotions.position), asc(promotions.id));
  const rows = filters.active === undefined ? await base : await base.where(eq(promotions.active, filters.active));
  return withItems(rows);
}

export async function findPromotion(id: number): Promise<PromotionRecord | null> {
  const [row] = await db.select().from(promotions).where(eq(promotions.id, id)).limit(1);
  if (!row) return null;
  const [record] = await withItems([row]);
  return record ?? null;
}

async function withItems(rows: Promotion[]): Promise<PromotionRecord[]> {
  if (rows.length === 0) return [];

  const joined = await db
    .select({ item: promotionItems, product: products })
    .from(promotionItems)
    .leftJoin(products, eq(promotionItems.productId, products.id))
    .where(inArray(promotionItems.promotionId, rows.map((row) => row.id)))
    .orderBy(asc(promotionItems.position), asc(promotionItems.id));

  // Main photo per product: the gallery wins over the legacy single image, the
  // same resolution the product serializer applies.
  const mainImages = await mainImageKeys(joined.map((row) => row.item.productId));

  return rows.map((promotion) => ({
    promotion,
    items: joined
      .filter((row) => row.item.promotionId === promotion.id)
      .map((row) => ({
        ...row.item,
        product: row.product,
        productImageKey: mainImages.get(row.item.productId) ?? row.product?.imageKey ?? null,
      })),
  }));
}

async function mainImageKeys(productIds: number[]): Promise<Map<number, string>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ productId: productImages.productId, fileKey: productImages.fileKey })
    .from(productImages)
    .where(inArray(productImages.productId, ids))
    .orderBy(asc(productImages.position), asc(productImages.id));

  const main = new Map<number, string>();
  for (const row of rows) if (!main.has(row.productId)) main.set(row.productId, row.fileKey);
  return main;
}

/**
 * Replaces the whole bundle, matching rows to existing records by `product_id`
 * rather than by id — the admin form has no id for a line the shop just added,
 * and matching by id would churn every row on every save.
 */
export async function replaceItems(
  tx: Transaction,
  promotionId: number,
  items: NormalizedItem[],
): Promise<void> {
  await tx.delete(promotionItems).where(eq(promotionItems.promotionId, promotionId));
  if (items.length === 0) return;

  await tx.insert(promotionItems).values(
    items.map((item) => ({
      promotionId,
      productId: item.productId,
      quantity: item.quantity,
      position: item.position,
    })),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Serialization
 * ──────────────────────────────────────────────────────────────────────────── */

export function toPriced(product: Product) {
  return {
    id: product.id,
    price: product.price,
    kind: product.kind,
    active: product.active,
    stock: product.stock,
    optionTypes: (product.optionTypes ?? []) as OptionType[],
  };
}

export function comboItems(record: PromotionRecord): ComboItem[] {
  return record.items.map((item) => ({
    quantity: item.quantity,
    product: item.product ? { ...toPriced(item.product), name: item.product.name } : null,
  }));
}

export function serializePromotion(record: PromotionRecord, now: Date = new Date()) {
  const { promotion } = record;
  const items = comboItems(record);

  return {
    id: promotion.id,
    name: promotion.name,
    slug: promotion.slug,
    description: promotion.description,
    price: promotion.price,
    regular_total: fromCents(regularTotal(items)),
    savings: fromCents(savings(promotion, items)),
    discount_percent: discountPercent(promotion, items),
    active: promotion.active,
    // Whether the storefront is showing it right now, which `active` alone
    // cannot answer once a window is set.
    live: isLive({ ...promotion }, now),
    sellable: isSellable({ ...promotion }, items, now),
    position: promotion.position,
    starts_at: promotion.startsAt,
    ends_at: promotion.endsAt,
    image_url: promotionImageUrl(record),
    available_units: availableUnits(items),
    contents_label: contentsLabel(items),
    items: record.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      position: item.position,
      product_name: item.product?.name ?? null,
      product_slug: item.product?.slug ?? null,
      product_price: item.product?.price ?? null,
      product_active: item.product?.active ?? null,
      product_stock: item.product?.stock ?? null,
      image_url: assetUrl(item.productImageKey),
    })),
    created_at: promotion.createdAt,
    updated_at: promotion.updatedAt,
  };
}

/**
 * The combo's own picture when the shop uploaded one, otherwise the main photo
 * of its first product — a combo card with no image at all reads as a broken
 * row in the storefront.
 */
export function promotionImageUrl(record: PromotionRecord): string {
  if (record.promotion.imageKey) return assetUrl(record.promotion.imageKey);
  return assetUrl(record.items[0]?.productImageKey);
}
