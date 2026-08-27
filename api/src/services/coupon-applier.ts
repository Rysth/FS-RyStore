import { and, eq, sql } from "drizzle-orm";
import { db, type Database } from "../db/client.ts";
import { coupons, type Coupon } from "../db/schema.ts";
import { minCents, percentOfCents, toCents, ZERO } from "../lib/money.ts";
import type { Cents } from "../lib/money.ts";

/**
 * Port of backend/app/services/coupon_applier.rb.
 *
 * Runs in two modes. The storefront's "validate coupon" button previews a
 * discount with no lock and no writes; checkout re-applies it inside the order
 * transaction with `lock: true`, so two buyers racing for the last use of a
 * limited coupon serialise on the row instead of both spending it.
 */

export type CouponResult = {
  coupon: Coupon | null;
  discountAmount: Cents;
  error: string | null;
};

/** Rails collapsed four distinct reasons into one message. Kept verbatim. */
const NOT_USABLE = "El cupón no es válido, expiró o alcanzó su límite de uso";
const NOT_FOUND = "El cupón no existe";

export function isUsable(coupon: Coupon, subtotal: Cents, at: Date = new Date()): boolean {
  if (!coupon.active) return false;
  if (coupon.startsAt && at < coupon.startsAt) return false;
  if (coupon.expiresAt && at > coupon.expiresAt) return false;
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return false;
  if (coupon.minOrderTotal !== null && subtotal < toCents(coupon.minOrderTotal)) return false;
  return true;
}

/** Never more than the subtotal, so an order total can't go negative. */
export function discountFor(coupon: Coupon, subtotal: Cents): Cents {
  const raw =
    coupon.discountType === "percentage"
      ? percentOfCents(subtotal, coupon.discountValue)
      : toCents(coupon.discountValue);

  return minCents(raw, subtotal);
}

export async function applyCoupon(
  options: { code: string | null | undefined; subtotal: Cents; lock?: boolean; at?: Date },
  executor: Database | Parameters<Parameters<Database["transaction"]>[0]>[0] = db,
): Promise<CouponResult> {
  const code = options.code?.trim();

  // No code is not an error — it is simply an order without a coupon.
  if (!code) return { coupon: null, discountAmount: ZERO, error: null };

  const normalized = code.toUpperCase();

  // `code` is stored already upper-cased, so this comparison uses the unique
  // index. Rails queried UPPER(code) = ? and could not.
  const query = executor
    .select()
    .from(coupons)
    .where(eq(coupons.code, normalized))
    .limit(1);

  const [coupon] = options.lock ? await query.for("update") : await query;

  if (!coupon) return { coupon: null, discountAmount: ZERO, error: NOT_FOUND };

  if (!isUsable(coupon, options.subtotal, options.at ?? new Date())) {
    return { coupon: null, discountAmount: ZERO, error: NOT_USABLE };
  }

  return { coupon, discountAmount: discountFor(coupon, options.subtotal), error: null };
}

/** Called after the order is saved, inside the same transaction. */
export async function incrementCouponUsage(
  couponId: number,
  executor: Database | Parameters<Parameters<Database["transaction"]>[0]>[0] = db,
): Promise<void> {
  await executor
    .update(coupons)
    .set({ usageCount: sql`${coupons.usageCount} + 1`, updatedAt: new Date() })
    .where(and(eq(coupons.id, couponId)));
}
