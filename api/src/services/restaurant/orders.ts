import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import {
  cashRegisters,
  paymentItems,
  payments,
  products,
  restaurantOrderItems,
  restaurantOrders,
} from "../../db/schema.ts";
import type { RestaurantOrder, RestaurantOrderItem, RestaurantPaymentMethod } from "../../db/schema.ts";
import { addCents, fromCents, multiplyCents, toCents, ZERO } from "../../lib/money.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ServiceResult<T> = { success: true; value: T } | { success: false; errors: string[] };

export interface RestaurantOrderLineInput {
  product_id: number;
  quantity: number;
  removed_ingredients?: string[];
  extras?: Array<{ name: string; price: string }>;
  notes?: string | null;
}

export interface CreateRestaurantOrderInput {
  userId: string;
  customerName: string;
  channel: "local" | "whatsapp" | "rappi" | "pedidosya" | "self_order";
  paymentMethod: RestaurantPaymentMethod;
  receivedAmount?: string | null;
  reference?: string | null;
  items: RestaurantOrderLineInput[];
}

export interface RestaurantOrderRecord {
  order: RestaurantOrder;
  items: RestaurantOrderItem[];
}

interface PendingLine {
  productId: number;
  productName: string;
  unitPrice: string;
  quantity: number;
  removedIngredients: string[];
  extras: Array<{ name: string; price: string }>;
  extrasTotal: string;
  subtotal: string;
  notes: string | null;
}

export async function createPaidRestaurantOrder(
  input: CreateRestaurantOrderInput,
): Promise<ServiceResult<RestaurantOrderRecord>> {
  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) return { success: false, errors: validationErrors };

  try {
    return await db.transaction(async (tx) => {
      const [register] = await tx
        .select()
        .from(cashRegisters)
        .where(eq(cashRegisters.status, "open"))
        .limit(1);

      if (!register) return { success: false, errors: ["Abre una caja antes de tomar pedidos"] };

      const pending = await buildPendingLines(input.items, tx);
      const lineErrors = pending.errors;
      if (lineErrors.length > 0) return { success: false, errors: lineErrors };

      const total = pending.lines.reduce((sum, line) => addCents(sum, toCents(line.subtotal)), ZERO);
      if (total <= ZERO) return { success: false, errors: ["El total del pedido debe ser mayor a 0"] };

      let receivedAmount: string | null = null;
      if (input.paymentMethod === "cash" && input.receivedAmount?.trim()) {
        const received = toCents(input.receivedAmount);
        if (received < total) {
          return { success: false, errors: ["El efectivo recibido no puede ser menor al total"] };
        }
        receivedAmount = fromCents(received);
      }
      if (input.paymentMethod !== "cash" && input.receivedAmount?.trim()) {
        return { success: false, errors: ["El efectivo recibido solo aplica para pagos en efectivo"] };
      }

      await tx.execute(sql`select pg_advisory_xact_lock(742001)`);
      const number = await nextOrderNumber(tx, register.businessDate);
      const now = new Date();
      const totalText = fromCents(total);

      const [order] = await tx
        .insert(restaurantOrders)
        .values({
          number,
          businessDate: register.businessDate,
          customerName: input.customerName.trim(),
          channel: input.channel,
          status: "preparing",
          paymentStatus: "paid",
          totalAmount: totalText,
          paidAmount: totalText,
          balanceAmount: "0.00",
          confirmedAt: now,
          cashRegisterId: register.id,
          userId: input.userId,
        })
        .returning();

      const insertedItems = await tx
        .insert(restaurantOrderItems)
        .values(
          pending.lines.map((line) => ({
            orderId: order!.id,
            productId: line.productId,
            productName: line.productName,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
            removedIngredients: line.removedIngredients,
            extras: line.extras,
            extrasTotal: line.extrasTotal,
            subtotal: line.subtotal,
            notes: line.notes,
            paymentStatus: "paid",
            paidAt: now,
          })),
        )
        .returning();

      const [payment] = await tx
        .insert(payments)
        .values({
          orderId: order!.id,
          cashRegisterId: register.id,
          userId: input.userId,
          paymentMethod: input.paymentMethod,
          amount: totalText,
          receivedAmount,
          reference: input.reference?.trim() || null,
          paidAt: now,
        })
        .returning();

      await tx.insert(paymentItems).values(
        insertedItems.map((item) => ({
          paymentId: payment!.id,
          orderItemId: item.id,
          amount: item.subtotal,
        })),
      );

      return { success: true, value: { order: order!, items: insertedItems } };
    });
  } catch (error) {
    if (isInvalidMoney(error)) return { success: false, errors: ["Uno de los importes no es válido"] };
    throw error;
  }
}

export async function listRestaurantOrders(): Promise<RestaurantOrderRecord[]> {
  const rows = await db
    .select()
    .from(restaurantOrders)
    .where(sql`${restaurantOrders.status} <> 'cancelled'`)
    .orderBy(desc(restaurantOrders.confirmedAt), desc(restaurantOrders.id))
    .limit(100);

  const itemsByOrder = await itemsForOrders(rows.map((row) => row.id));
  return rows.map((order) => ({ order, items: itemsByOrder.get(order.id) ?? [] }));
}

export async function kitchenQueue(): Promise<RestaurantOrderRecord[]> {
  const rows = await db
    .select()
    .from(restaurantOrders)
    .where(inArray(restaurantOrders.status, ["preparing", "ready"]))
    .orderBy(asc(restaurantOrders.confirmedAt), asc(restaurantOrders.id));

  const itemsByOrder = await itemsForOrders(rows.map((row) => row.id));
  return rows.map((order) => ({ order, items: itemsByOrder.get(order.id) ?? [] }));
}

export async function markKitchenOrderReady(orderId: number): Promise<ServiceResult<RestaurantOrderRecord>> {
  const [current] = await db.select().from(restaurantOrders).where(eq(restaurantOrders.id, orderId)).limit(1);
  if (!current) return { success: false, errors: ["Pedido no encontrado"] };
  if (current.status === "ready") return { success: true, value: (await findRestaurantOrder(orderId))! };
  if (current.status !== "preparing") return { success: false, errors: ["Solo un pedido en preparación puede marcarse como listo"] };

  const now = new Date();
  const prepSeconds = current.confirmedAt ? Math.max(0, Math.floor((now.getTime() - current.confirmedAt.getTime()) / 1000)) : null;
  await db
    .update(restaurantOrders)
    .set({ status: "ready", readyAt: now, prepSeconds, updatedAt: now })
    .where(eq(restaurantOrders.id, orderId));

  return { success: true, value: (await findRestaurantOrder(orderId))! };
}

export async function deliverRestaurantOrder(orderId: number): Promise<ServiceResult<RestaurantOrderRecord>> {
  const [current] = await db.select().from(restaurantOrders).where(eq(restaurantOrders.id, orderId)).limit(1);
  if (!current) return { success: false, errors: ["Pedido no encontrado"] };
  if (current.status !== "ready") return { success: false, errors: ["Solo un pedido listo puede entregarse"] };

  const now = new Date();
  const deliverySeconds = current.readyAt ? Math.max(0, Math.floor((now.getTime() - current.readyAt.getTime()) / 1000)) : null;
  await db
    .update(restaurantOrders)
    .set({ status: "delivered", deliveredAt: now, deliverySeconds, updatedAt: now })
    .where(eq(restaurantOrders.id, orderId));

  return { success: true, value: (await findRestaurantOrder(orderId))! };
}

export async function cancelRestaurantOrder(
  orderId: number,
  userId: string,
  reason: string,
): Promise<ServiceResult<RestaurantOrderRecord>> {
  const [current] = await db.select().from(restaurantOrders).where(eq(restaurantOrders.id, orderId)).limit(1);
  if (!current) return { success: false, errors: ["Pedido no encontrado"] };
  if (current.status === "cancelled") return { success: true, value: (await findRestaurantOrder(orderId))! };
  if (current.status === "delivered") return { success: false, errors: ["No se puede cancelar un pedido ya entregado"] };

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 1) return { success: false, errors: ["El motivo de anulación es obligatorio"] };
  if (trimmedReason.length > 255) return { success: false, errors: ["El motivo no puede superar 255 caracteres"] };

  const now = new Date();
  await db
    .update(restaurantOrders)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: userId,
      cancelReason: trimmedReason,
      updatedAt: now,
    })
    .where(eq(restaurantOrders.id, orderId));

  return { success: true, value: (await findRestaurantOrder(orderId))! };
}

export async function findRestaurantOrder(orderId: number): Promise<RestaurantOrderRecord | null> {
  const [order] = await db.select().from(restaurantOrders).where(eq(restaurantOrders.id, orderId)).limit(1);
  if (!order) return null;
  const itemsByOrder = await itemsForOrders([order.id]);
  return { order, items: itemsByOrder.get(order.id) ?? [] };
}

export function serializeRestaurantOrder(record: RestaurantOrderRecord) {
  const { order } = record;
  return {
    id: order.id,
    number: order.number,
    business_date: order.businessDate,
    customer_name: order.customerName,
    channel: order.channel,
    status: order.status,
    payment_status: order.paymentStatus,
    total_amount: order.totalAmount,
    paid_amount: order.paidAmount,
    balance_amount: order.balanceAmount,
    confirmed_at: order.confirmedAt?.toISOString() ?? null,
    ready_at: order.readyAt?.toISOString() ?? null,
    delivered_at: order.deliveredAt?.toISOString() ?? null,
    prep_seconds: order.prepSeconds,
    delivery_seconds: order.deliverySeconds,
    cash_register_id: order.cashRegisterId,
    items: record.items.map(serializeRestaurantOrderItem),
    created_at: order.createdAt.toISOString(),
    updated_at: order.updatedAt.toISOString(),
  };
}

export function serializeKitchenOrder(record: RestaurantOrderRecord) {
  const { order } = record;
  return {
    id: order.id,
    number: order.number,
    customer_name: order.customerName,
    channel: order.channel,
    status: order.status,
    confirmed_at: order.confirmedAt?.toISOString() ?? null,
    items: record.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      product_name: item.productName,
      removed_ingredients: item.removedIngredients,
      extras: item.extras,
      notes: item.notes,
    })),
  };
}

function serializeRestaurantOrderItem(item: RestaurantOrderItem) {
  return {
    id: item.id,
    product_id: item.productId,
    product_name: item.productName,
    unit_price: item.unitPrice,
    quantity: item.quantity,
    removed_ingredients: item.removedIngredients,
    extras: item.extras,
    extras_total: item.extrasTotal,
    subtotal: item.subtotal,
    notes: item.notes,
    payment_status: item.paymentStatus,
    paid_at: item.paidAt?.toISOString() ?? null,
  };
}

async function buildPendingLines(
  inputItems: RestaurantOrderLineInput[],
  tx: Tx,
): Promise<{ lines: PendingLine[]; errors: string[] }> {
  const productIds = [...new Set(inputItems.map((item) => item.product_id))];
  const productRows = productIds.length === 0
    ? []
    : await tx.select().from(products).where(and(inArray(products.id, productIds), eq(products.active, true)));
  const productById = new Map(productRows.map((product) => [product.id, product]));
  const lines: PendingLine[] = [];
  const errors: string[] = [];

  for (const [index, item] of inputItems.entries()) {
    const product = productById.get(item.product_id);
    if (!product) {
      errors.push(`Ítem ${index + 1}: producto no disponible`);
      continue;
    }

    try {
      const unitCents = toCents(product.price);
      const extras = normalizeExtras(item.extras ?? []);
      const extrasUnitTotal = extras.reduce((sum, extra) => addCents(sum, toCents(extra.price)), ZERO);
      const extrasTotal = multiplyCents(extrasUnitTotal, item.quantity);
      const subtotal = addCents(multiplyCents(unitCents, item.quantity), extrasTotal);

      lines.push({
        productId: product.id,
        productName: product.name,
        unitPrice: fromCents(unitCents),
        quantity: item.quantity,
        removedIngredients: normalizeStrings(item.removed_ingredients ?? []),
        extras,
        extrasTotal: fromCents(extrasTotal),
        subtotal: fromCents(subtotal),
        notes: item.notes?.trim() || null,
      });
    } catch {
      errors.push(`Ítem ${index + 1}: importe no válido`);
    }
  }

  return { lines, errors };
}

async function nextOrderNumber(tx: Tx, businessDate: string): Promise<number> {
  const [row] = await tx
    .select({ next: sql<number>`coalesce(max(${restaurantOrders.number}), 0)::int + 1` })
    .from(restaurantOrders)
    .where(eq(restaurantOrders.businessDate, businessDate));
  return row?.next ?? 1;
}

async function itemsForOrders(orderIds: number[]): Promise<Map<number, RestaurantOrderItem[]>> {
  if (orderIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(restaurantOrderItems)
    .where(inArray(restaurantOrderItems.orderId, orderIds))
    .orderBy(asc(restaurantOrderItems.id));
  const grouped = new Map<number, RestaurantOrderItem[]>();
  for (const item of rows) {
    const list = grouped.get(item.orderId) ?? [];
    list.push(item);
    grouped.set(item.orderId, list);
  }
  return grouped;
}

function validateInput(input: CreateRestaurantOrderInput): string[] {
  const errors: string[] = [];
  if (input.customerName.trim().length < 1) errors.push("El nombre del cliente es requerido");
  if (input.customerName.trim().length > 60) errors.push("El nombre del cliente no puede superar 60 caracteres");
  if (input.items.length === 0) errors.push("Agrega al menos un producto");
  if (input.items.length > 50) errors.push("No puedes agregar más de 50 productos en un pedido");

  for (const [index, item] of input.items.entries()) {
    if (!Number.isInteger(item.product_id) || item.product_id <= 0) {
      errors.push(`Ítem ${index + 1}: producto inválido`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push(`Ítem ${index + 1}: la cantidad debe ser mayor a 0`);
    }
  }

  return errors;
}

function normalizeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeExtras(values: Array<{ name: string; price: string }>): Array<{ name: string; price: string }> {
  return values
    .map((extra) => ({ name: extra.name.trim(), price: fromCents(toCents(extra.price)) }))
    .filter((extra) => extra.name && toCents(extra.price) > ZERO);
}

function isInvalidMoney(error: unknown): boolean {
  return error instanceof TypeError && error.message.startsWith("Importe no numérico");
}
