import type { CartItem, PriceTier } from "../types/store";
import { formatPrice, pluralize } from "./format";

/**
 * Anything carrying a base price plus an optional wholesale ladder: a
 * StoreProduct or a persisted CartItem.
 */
export interface TieredPrice {
  price: string;
  price_tiers?: PriceTier[] | null;
}

/**
 * Every helper tolerates a missing/!null ladder and falls back to the base
 * price. A cart rehydrated from an older localStorage blob must never crash the
 * storefront, so the tolerance lives here rather than only in the migration.
 */
export function sortedTiers(source: TieredPrice): PriceTier[] {
  const tiers = source.price_tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return [];

  return [...tiers]
    .filter((tier) => Number.isFinite(Number(tier?.min_quantity)))
    .sort((a, b) => Number(a.min_quantity) - Number(b.min_quantity));
}

export function hasTiers(source: TieredPrice): boolean {
  return sortedTiers(source).length > 0;
}

/**
 * Mirrors Product#unit_price_for on the server: the highest tier the quantity
 * reaches, falling back to the base price. The server always recomputes this at
 * checkout — this is for display only.
 */
export function unitPriceFor(source: TieredPrice, quantity: number): number {
  const base = Number(source.price) || 0;
  if (!Number.isFinite(quantity) || quantity < 1) return base;

  const applicable = sortedTiers(source).filter(
    (tier) => Number(tier.min_quantity) <= quantity,
  );
  if (applicable.length === 0) return base;

  const best = applicable[applicable.length - 1];
  const price = Number(best.unit_price);
  return Number.isFinite(price) ? price : base;
}

export function lineTotal(item: CartItem): number {
  return unitPriceFor(item, item.quantity) * item.quantity;
}

/**
 * The next cheaper step the buyer can actually reach, or null.
 *
 * Returns null when the tier costs the same or more than what they already pay
 * (a defensive guard against a bad ladder in a stale cart — the storefront must
 * never advertise a price increase) or when stock can't cover it, since the
 * quantity stepper caps at stock and the buyer would be stuck.
 */
export function nextTier(
  source: TieredPrice,
  quantity: number,
  stock?: number | null,
): { tier: PriceTier; missing: number } | null {
  const current = unitPriceFor(source, quantity);

  for (const tier of sortedTiers(source)) {
    const min = Number(tier.min_quantity);
    if (min <= quantity) continue;
    if (!(Number(tier.unit_price) < current)) continue;
    if (stock != null && min > stock) continue;

    return { tier, missing: min - quantity };
  }

  return null;
}

/** "Agrega 2 más y pagas $4.20 c/u" — null when there is nothing to nudge about. */
export function tierNudge(
  source: TieredPrice,
  quantity: number,
  stock?: number | null,
): string | null {
  const next = nextTier(source, quantity, stock);
  if (!next) return null;

  const unit = pluralize(next.missing, "1 más", `${next.missing} más`);
  return `Agrega ${unit} y pagas ${formatPrice(next.tier.unit_price)} c/u`;
}

/** The cheapest price the ladder can reach, for "por mayor desde" badges. */
export function bestTierPrice(source: TieredPrice): number | null {
  const tiers = sortedTiers(source);
  if (tiers.length === 0) return null;

  return Math.min(...tiers.map((tier) => Number(tier.unit_price)));
}
