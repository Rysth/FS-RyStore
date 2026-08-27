import { fromCents, maxCents, multiplyCents, subtractCents, toCents, ZERO } from "../lib/money.ts";
import type { Cents } from "../lib/money.ts";
import type { OptionType, VariantOptions } from "../db/schema.ts";

/**
 * Pure pricing and availability rules, ported from the Product, ProductVariant,
 * PriceTier and Promotion models.
 *
 * These take plain rows rather than reading the database so they can be unit
 * tested without one, and so OrderCreator can apply them to the snapshot it
 * loaded inside its transaction.
 */

export type TierRow = { minQuantity: number; unitPrice: string };

export type PricedProduct = {
  id: number;
  price: string;
  active: boolean;
  kind: string;
  stock: number | null;
  optionTypes: OptionType[];
};

export type PricedVariant = {
  id: number;
  productId: number;
  options: VariantOptions;
  price: string | null;
  stock: number | null;
};

export function isService(product: Pick<PricedProduct, "kind">): boolean {
  return product.kind === "service";
}

export function hasVariants(product: Pick<PricedProduct, "optionTypes">): boolean {
  return Array.isArray(product.optionTypes) && product.optionTypes.length > 0;
}

export function optionTypeNames(product: Pick<PricedProduct, "optionTypes">): string[] {
  return (product.optionTypes ?? []).map((axis) => axis.name);
}

/**
 * The wholesale ladder: the tier with the highest `min_quantity` at or below
 * `quantity` wins, falling back to the list price.
 *
 * `quantity` is the *merged* cart quantity for the product, summed across its
 * variants — see tierQuantities in order-creator.ts. Two separate additions of
 * 3 units qualify for the "from 6" tier together, which is the whole point of
 * the feature for a wholesaler.
 */
export function unitPriceForProduct(
  product: Pick<PricedProduct, "price">,
  tiers: TierRow[],
  quantity: number,
): Cents {
  const listPrice = toCents(product.price);
  if (quantity < 1) return listPrice;

  let best: TierRow | null = null;
  for (const tier of tiers) {
    if (tier.minQuantity <= quantity && (!best || tier.minQuantity > best.minQuantity)) {
      best = tier;
    }
  }

  return best ? toCents(best.unitPrice) : listPrice;
}

/** A variant with its own price opts out of the ladder entirely. */
export function unitPriceForVariant(
  variant: Pick<PricedVariant, "price">,
  product: Pick<PricedProduct, "price">,
  tiers: TierRow[],
  quantity: number,
): Cents {
  if (variant.price !== null && variant.price !== undefined && variant.price !== "") {
    return toCents(variant.price);
  }
  return unitPriceForProduct(product, tiers, quantity);
}

/** "Talla: M · Color: Negro", following the order the product declares. */
export function variantLabel(
  product: Pick<PricedProduct, "optionTypes">,
  options: VariantOptions,
): string {
  return optionTypeNames(product)
    .filter((name) => options[name] !== undefined)
    .map((name) => `${name}: ${options[name]}`)
    .join(" · ");
}

/**
 * A NULL stock means the shop does not track inventory for that row: it never
 * blocks a checkout and is never decremented.
 */
export function variantAvailable(
  variant: Pick<PricedVariant, "stock">,
  product: Pick<PricedProduct, "active" | "kind">,
  quantity = 1,
): boolean {
  if (!product.active) return false;
  if (isService(product)) return true;
  if (variant.stock === null) return true;
  return variant.stock >= quantity;
}

export function productAvailable(
  product: PricedProduct,
  variants: PricedVariant[],
  quantity = 1,
): boolean {
  if (!product.active) return false;
  if (hasVariants(product)) {
    return variants.some((variant) => variantAvailable(variant, product, quantity));
  }
  if (isService(product)) return true;
  if (product.stock === null) return true;
  return product.stock >= quantity;
}

/** NULL means "not tracked" — for a service, or when any variant is untracked. */
export function totalStock(product: PricedProduct, variants: PricedVariant[]): number | null {
  if (isService(product)) return null;
  if (!hasVariants(product)) return product.stock;
  if (variants.some((variant) => variant.stock === null)) return null;
  return variants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Combos (promotions)
 * ──────────────────────────────────────────────────────────────────────────── */

export type ComboItem = {
  quantity: number;
  product: (PricedProduct & { name: string }) | null;
};

export type PricedPromotion = {
  price: string;
  active: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** Sum of the bundle at list price — never the ladder, or the combo would double-discount. */
export function regularTotal(items: ComboItem[]): Cents {
  return items.reduce<Cents>((total, item) => {
    if (!item.product) return total;
    return total + multiplyCents(toCents(item.product.price), item.quantity);
  }, ZERO);
}

export function savings(promotion: Pick<PricedPromotion, "price">, items: ComboItem[]): Cents {
  return maxCents(subtractCents(regularTotal(items), toCents(promotion.price)), ZERO);
}

export function discountPercent(
  promotion: Pick<PricedPromotion, "price">,
  items: ComboItem[],
): number {
  const regular = regularTotal(items);
  if (regular <= ZERO) return 0;
  return Math.round(Number(savings(promotion, items) * 100n) / Number(regular));
}

export function isLive(promotion: PricedPromotion, now: Date = new Date()): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && promotion.startsAt > now) return false;
  if (promotion.endsAt && promotion.endsAt < now) return false;
  return true;
}

/**
 * How many whole combos the bundle's stock can still cover. NULL when every
 * component is untracked or a service — i.e. unlimited.
 */
export function availableUnits(items: ComboItem[]): number | null {
  let limit: number | null = null;

  for (const item of items) {
    const product = item.product;
    if (!product || isService(product) || product.stock === null) continue;
    const units = Math.floor(product.stock / Math.max(item.quantity, 1));
    limit = limit === null ? units : Math.min(limit, units);
  }

  return limit;
}

/**
 * Sellable says the combo is well-formed and running — it says nothing about
 * stock, which `comboAvailable` adds.
 */
export function isSellable(
  promotion: PricedPromotion,
  items: ComboItem[],
  now: Date = new Date(),
): boolean {
  if (!isLive(promotion, now)) return false;
  const present = items.filter((item) => item.product !== null);
  if (present.length < 2) return false;
  return present.every((item) => item.product!.active);
}

export function comboAvailable(
  promotion: PricedPromotion,
  items: ComboItem[],
  quantity = 1,
  now: Date = new Date(),
): boolean {
  if (!isSellable(promotion, items, now)) return false;
  const units = availableUnits(items);
  return units === null || units >= quantity;
}

/** "Sérum x1 · Crema x2" — frozen onto the order line as `details`. */
export function contentsLabel(items: ComboItem[]): string {
  return items
    .filter((item) => item.product !== null)
    .map((item) => `${item.product!.name} x${item.quantity}`)
    .join(" · ");
}

/** A combo has no ladder: its price is the discount. Named to match Product. */
export function unitPriceForPromotion(promotion: Pick<PricedPromotion, "price">): Cents {
  return toCents(promotion.price);
}

/** Convenience for serializers that emit "0.00" strings. */
export function money(cents: Cents): string {
  return fromCents(cents);
}
