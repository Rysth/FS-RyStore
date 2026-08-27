import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { orderItems, orders, products, productVariants } from "../db/schema.ts";

/**
 * Port of backend/app/services/order_canceller.rb.
 *
 * Cancelling restores stock and nothing else — the coupon's usage_count is
 * deliberately left alone, matching Rails. A coupon with a usage limit that a
 * buyer burned on a cancelled order stays burned; refunding it would let
 * someone drain a limited promo by ordering and cancelling in a loop.
 */
export async function cancelOrder(orderId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1).for("update");
    if (!order) return false;

    // Idempotent: cancelling an already-cancelled order is a success, so a
    // double-clicked button does not restore stock twice.
    if (order.status === "cancelado") return true;
    if (order.status !== "pendiente") return false;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

    for (const item of items) {
      if (item.productVariantId !== null) {
        await tx
          .update(productVariants)
          .set({
            stock: sql`case when ${productVariants.stock} is null then null
                            else ${productVariants.stock} + ${item.quantity} end`,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, item.productVariantId));
        continue;
      }

      if (item.productId === null) continue;

      // Services have no stock, and a NULL stock stays NULL — restoring it to
      // a number would silently start tracking inventory the shop never kept.
      await tx
        .update(products)
        .set({
          stock: sql`case when ${products.stock} is null or ${products.kind} = 'service' then ${products.stock}
                          else ${products.stock} + ${item.quantity} end`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, item.productId));
    }

    await tx
      .update(orders)
      .set({ status: "cancelado", updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    return true;
  });
}
