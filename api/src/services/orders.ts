import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import {
  coupons,
  orderItems,
  orders,
  productImages,
  products,
  promotionItems,
  promotions,
  DELIVERY_METHOD_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABELS,
} from "../db/schema.ts";
import type { DeliveryMethod, Order, OrderItem, OrderStatus, PaymentMethod } from "../db/schema.ts";
import { assetUrl } from "../lib/serializers.ts";

/** Port of Api::V1::OrdersController's data access. */

export type OrderRecord = {
  order: Order;
  couponCode: string | null;
  itemsCount: number;
  items: OrderItem[];
};

export type OrderFilters = { status?: string; search?: string };

export async function listOrders(
  filters: OrderFilters,
  page: number,
  perPage: number,
): Promise<{ rows: OrderRecord[]; total: number }> {
  const conditions = [];
  if (filters.status && (ORDER_STATUSES as readonly string[]).includes(filters.status)) {
    conditions.push(eq(orders.status, filters.status));
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      sql`(${orders.customerName} ilike ${term} or ${orders.phone} ilike ${term} or ${orders.number} ilike ${term})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);

  const rows = await db
    .select({ order: orders, couponCode: coupons.code })
    .from(orders)
    .leftJoin(coupons, eq(orders.couponId, coupons.id))
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Only the count is needed for the list; loading every line would be N
  // queries for a screen that renders one number per row.
  const counts = await lineCounts(rows.map((row) => row.order.id));

  return {
    total: count,
    rows: rows.map((row) => ({
      order: row.order,
      couponCode: row.couponCode,
      itemsCount: counts.get(row.order.id) ?? 0,
      items: [],
    })),
  };
}

async function lineCounts(orderIds: number[]): Promise<Map<number, number>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select({ orderId: orderItems.orderId, count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(inArray(orderItems.orderId, orderIds))
    .groupBy(orderItems.orderId);
  return new Map(rows.map((row) => [row.orderId, row.count]));
}

export async function findOrder(id: number): Promise<OrderRecord | null> {
  const [row] = await db
    .select({ order: orders, couponCode: coupons.code })
    .from(orders)
    .leftJoin(coupons, eq(orders.couponId, coupons.id))
    .where(eq(orders.id, id))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, row.order.id))
    .orderBy(asc(orderItems.id));

  return { order: row.order, couponCode: row.couponCode, itemsCount: items.length, items };
}

/** Always all five statuses, with 0 where there are none — the admin tabs. */
export async function statusSummary(): Promise<Record<OrderStatus, number>> {
  const rows = await db
    .select({ status: orders.status, count: sql<number>`count(*)::int` })
    .from(orders)
    .groupBy(orders.status);

  const counts = new Map(rows.map((row) => [row.status, row.count]));
  return Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, counts.get(status) ?? 0]),
  ) as Record<OrderStatus, number>;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Line pictures
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Resolves the picture for every line of an order in three queries instead of
 * per line. A line whose product left the catalog resolves to "": it keeps its
 * own frozen name and price, but there is no photo left to point at.
 */
export async function lineImageUrls(items: OrderItem[]): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  if (items.length === 0) return resolved;

  const productIds = [...new Set(items.map((item) => item.productId).filter(isId))];
  const promotionIds = [...new Set(items.map((item) => item.promotionId).filter(isId))];

  const [productKeys, promotionKeys] = await Promise.all([
    mainProductImages(productIds),
    mainPromotionImages(promotionIds),
  ]);

  for (const item of items) {
    if (item.productId) resolved.set(item.id, assetUrl(productKeys.get(item.productId)));
    // A combo line has no product of its own; its picture comes from the
    // promotion, falling back to the first product in the bundle.
    else if (item.promotionId) resolved.set(item.id, assetUrl(promotionKeys.get(item.promotionId)));
    else resolved.set(item.id, "");
  }

  return resolved;
}

const isId = (value: number | null): value is number => value !== null;

async function mainProductImages(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();

  const [gallery, legacy] = await Promise.all([
    db
      .select({ productId: productImages.productId, fileKey: productImages.fileKey })
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.position), asc(productImages.id)),
    db
      .select({ id: products.id, imageKey: products.imageKey })
      .from(products)
      .where(inArray(products.id, ids)),
  ]);

  const main = new Map<number, string>();
  for (const row of gallery) if (!main.has(row.productId)) main.set(row.productId, row.fileKey);
  for (const row of legacy) if (!main.has(row.id) && row.imageKey) main.set(row.id, row.imageKey);
  return main;
}

async function mainPromotionImages(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({ id: promotions.id, imageKey: promotions.imageKey })
    .from(promotions)
    .where(inArray(promotions.id, ids));

  const main = new Map<number, string>();
  const missing: number[] = [];
  for (const row of rows) {
    if (row.imageKey) main.set(row.id, row.imageKey);
    else missing.push(row.id);
  }
  if (missing.length === 0) return main;

  const firstProducts = await db
    .select({ promotionId: promotionItems.promotionId, productId: promotionItems.productId })
    .from(promotionItems)
    .where(inArray(promotionItems.promotionId, missing))
    .orderBy(asc(promotionItems.position), asc(promotionItems.id));

  const firstOf = new Map<number, number>();
  for (const row of firstProducts) {
    if (!firstOf.has(row.promotionId)) firstOf.set(row.promotionId, row.productId);
  }

  const productKeys = await mainProductImages([...new Set(firstOf.values())]);
  for (const [promotionId, productId] of firstOf) {
    const key = productKeys.get(productId);
    if (key) main.set(promotionId, key);
  }
  return main;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Serialization
 * ──────────────────────────────────────────────────────────────────────────── */

export function serializeOrder(
  record: OrderRecord,
  options: { includeItems?: boolean; imageUrls?: Map<number, string> } = {},
) {
  const { order } = record;

  const data: Record<string, unknown> = {
    id: order.id,
    number: order.number,
    customer_name: order.customerName,
    phone: order.phone,
    address: order.address,
    city: order.city,
    notes: order.notes,
    payment_method: order.paymentMethod,
    payment_method_label: PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod,
    delivery_method: order.deliveryMethod,
    delivery_method_label:
      DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod] ?? order.deliveryMethod,
    status: order.status,
    subtotal: order.subtotal,
    discount_amount: order.discountAmount,
    coupon_code: record.couponCode,
    total: order.total,
    customer_id: order.customerId,
    items_count: record.itemsCount,
    // public_token is deliberately absent: it authorises the buyer's
    // confirmation page and must never leak through the admin API.
    payment_proof_url: assetUrl(order.paymentProofKey),
    created_at: order.createdAt,
    updated_at: order.updatedAt,
  };

  if (options.includeItems) {
    data.items = record.items.map((item) => ({
      id: item.id,
      product_id: item.productId,
      product_name: item.productName,
      variant_label: item.variantLabel,
      // A combo line has no product of its own; `details` is what it held, so
      // the shop can pick the order from this row alone.
      details: item.details,
      image_url: options.imageUrls?.get(item.id) ?? "",
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
    }));
  }

  return data;
}

/** Detail payload with the line pictures resolved. */
export async function serializeOrderDetail(record: OrderRecord) {
  return serializeOrder(record, {
    includeItems: true,
    imageUrls: await lineImageUrls(record.items),
  });
}
