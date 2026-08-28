import { and, eq, ne, sql } from "drizzle-orm";
import { db, type Database } from "../db/client.ts";
import { customers, orders, type Customer } from "../db/schema.ts";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Port of backend/app/models/customer.rb.
 *
 * Buyers have no account — WhatsApp is the only channel — so the phone number
 * is the identity. It is stored as digits only, which is what makes
 * "0999123456" and "+593 99 912 3456" the same person.
 */

export function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

/**
 * Finds the customer by phone or creates them, refreshing name/email/address/city
 * only when the checkout actually supplied them — a buyer who leaves the
 * address blank on a pickup order must not wipe the one on file.
 */
export async function findOrCreateForOrder(
  input: {
    name?: string | null;
    phone: string;
    email?: string | null;
    address?: string | null;
    city?: string | null;
  },
  executor: Executor = db,
): Promise<Customer | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const [existing] = await executor
    .select()
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);

  const patch = {
    ...(input.name?.trim() ? { name: input.name.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.address?.trim() ? { address: input.address.trim() } : {}),
    ...(input.city?.trim() ? { city: input.city.trim() } : {}),
  };

  if (existing) {
    if (Object.keys(patch).length === 0) return existing;
    const [updated] = await executor
      .update(customers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(customers.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await executor.insert(customers).values({ phone, ...patch }).returning();
  return created ?? null;
}

/**
 * Recomputes the denormalised totals from scratch rather than incrementing, so
 * a cancelled or edited order can never leave them drifting. Cancelled orders
 * are excluded.
 */
export async function refreshStats(customerId: number, executor: Executor = db): Promise<void> {
  const [totals] = await executor
    .select({
      ordersCount: sql<number>`count(*)::int`,
      totalSpent: sql<string>`coalesce(sum(${orders.total}), 0)::numeric(10,2)`,
      // Raw SQL bypasses Drizzle's column mapping, so this arrives as the
      // driver's string rather than a Date and has to be converted by hand.
      lastOrderAt: sql<string | null>`max(${orders.createdAt})`,
    })
    .from(orders)
    .where(and(eq(orders.customerId, customerId), ne(orders.status, "cancelado")));

  await executor
    .update(customers)
    .set({
      ordersCount: totals?.ordersCount ?? 0,
      totalSpent: totals?.totalSpent ?? "0.00",
      lastOrderAt: totals?.lastOrderAt ? new Date(totals.lastOrderAt) : null,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customerId));
}

/** Used by the admin customers list to hydrate names for report rows. */
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  const [row] = await db.select().from(customers).where(eq(customers.phone, digits)).limit(1);
  return row ?? null;
}
