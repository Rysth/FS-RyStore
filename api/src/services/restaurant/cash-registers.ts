import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { cashRegisters, payments, restaurantOrders } from "../../db/schema.ts";
import type { CashRegister } from "../../db/schema.ts";
import { fromCents, subtractCents, toCents } from "../../lib/money.ts";

type ServiceResult<T> = { success: true; value: T } | { success: false; errors: string[] };

interface OpenCashRegisterInput {
  userId: string;
  openingAmount: string;
}

interface CloseCashRegisterInput {
  id: number;
  userId: string;
  closingAmount: string;
  notes?: string | null;
}

interface CashRegisterTotals {
  cashTotal: string;
  transferTotal: string;
  cardTotal: string;
  platformTotal: string;
  totalSales: string;
  ordersCount: number;
  ordersPaidCount: number;
}

export function serializeCashRegister(row: CashRegister) {
  return {
    id: row.id,
    status: row.status,
    business_date: row.businessDate,
    opened_by: row.openedBy,
    opened_at: row.openedAt.toISOString(),
    closed_by: row.closedBy,
    closed_at: row.closedAt?.toISOString() ?? null,
    opening_amount: row.openingAmount,
    closing_amount: row.closingAmount,
    expected_cash: row.expectedCash,
    cash_total: row.cashTotal,
    transfer_total: row.transferTotal,
    card_total: row.cardTotal,
    platform_total: row.platformTotal,
    total_sales: row.totalSales,
    difference: row.difference,
    orders_count: row.ordersCount,
    orders_paid_count: row.ordersPaidCount,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export async function findOpenCashRegister(): Promise<CashRegister | null> {
  const [row] = await db
    .select()
    .from(cashRegisters)
    .where(eq(cashRegisters.status, "open"))
    .limit(1);
  return row ?? null;
}

export async function openCashRegister(input: OpenCashRegisterInput): Promise<ServiceResult<CashRegister>> {
  let openingAmount: string;
  try {
    const cents = toCents(input.openingAmount);
    if (cents < 0n) return { success: false, errors: ["El fondo inicial no puede ser negativo"] };
    openingAmount = fromCents(cents);
  } catch {
    return { success: false, errors: ["El fondo inicial no es válido"] };
  }

  try {
    const [row] = await db
      .insert(cashRegisters)
      .values({
        status: "open",
        businessDate: businessDateFor(new Date()),
        openedBy: input.userId,
        openingAmount,
      })
      .returning();

    return { success: true, value: row! };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, errors: ["Ya hay una caja abierta"] };
    }
    throw error;
  }
}

export async function closeCashRegister(input: CloseCashRegisterInput): Promise<ServiceResult<CashRegister>> {
  let closingCents: bigint;
  try {
    closingCents = toCents(input.closingAmount);
    if (closingCents < 0n) return { success: false, errors: ["El efectivo contado no puede ser negativo"] };
  } catch {
    return { success: false, errors: ["El efectivo contado no es válido"] };
  }

  const [current] = await db
    .select()
    .from(cashRegisters)
    .where(and(eq(cashRegisters.id, input.id), eq(cashRegisters.status, "open")))
    .limit(1);

  if (!current) return { success: false, errors: ["Caja abierta no encontrada"] };
  if (current.openedBy !== input.userId) {
    return { success: false, errors: ["Solo quien abrió la caja puede cerrarla"] };
  }

  const active = await activeOrdersForRegister(input.id);
  if (active.count > 0) {
    return {
      success: false,
      errors: [
        `Hay ${active.count} pedido(s) en cocina o listos por ${active.total}. Entrégalos antes de cerrar.`,
      ],
    };
  }

  const totals = await liveTotals(input.id);
  const expectedCash = toCents(current.openingAmount) + toCents(totals.cashTotal);
  const difference = subtractCents(closingCents, expectedCash);

  const [closed] = await db
    .update(cashRegisters)
    .set({
      status: "closed",
      closedBy: input.userId,
      closedAt: new Date(),
      closingAmount: fromCents(closingCents),
      expectedCash: fromCents(expectedCash),
      cashTotal: totals.cashTotal,
      transferTotal: totals.transferTotal,
      cardTotal: totals.cardTotal,
      platformTotal: totals.platformTotal,
      totalSales: totals.totalSales,
      difference: fromCents(difference),
      ordersCount: totals.ordersCount,
      ordersPaidCount: totals.ordersPaidCount,
      notes: input.notes?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(cashRegisters.id, current.id))
    .returning();

  return { success: true, value: closed! };
}

export async function liveTotals(cashRegisterId: number): Promise<CashRegisterTotals> {
  const [paymentTotals] = await db
    .select({
      cashTotal: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paymentMethod} = 'cash'), 0)::numeric(10,2)`,
      transferTotal: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paymentMethod} = 'transfer'), 0)::numeric(10,2)`,
      cardTotal: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paymentMethod} = 'card'), 0)::numeric(10,2)`,
      platformTotal: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.paymentMethod} = 'platform'), 0)::numeric(10,2)`,
      totalSales: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(10,2)`,
      ordersPaidCount: sql<number>`count(distinct ${payments.orderId})::int`,
    })
    .from(payments)
    .innerJoin(restaurantOrders, eq(restaurantOrders.id, payments.orderId))
    .where(
      and(
        eq(payments.cashRegisterId, cashRegisterId),
        sql`${restaurantOrders.status} <> 'cancelled'`,
      ),
    );

  const [orderTotals] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(restaurantOrders)
    .where(and(eq(restaurantOrders.cashRegisterId, cashRegisterId), sql`${restaurantOrders.status} <> 'cancelled'`));

  return {
    cashTotal: normalizeMoney(paymentTotals?.cashTotal),
    transferTotal: normalizeMoney(paymentTotals?.transferTotal),
    cardTotal: normalizeMoney(paymentTotals?.cardTotal),
    platformTotal: normalizeMoney(paymentTotals?.platformTotal),
    totalSales: normalizeMoney(paymentTotals?.totalSales),
    ordersCount: orderTotals?.count ?? 0,
    ordersPaidCount: paymentTotals?.ordersPaidCount ?? 0,
  };
}

async function activeOrdersForRegister(cashRegisterId: number): Promise<{ count: number; total: string }> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${restaurantOrders.totalAmount}), 0)::numeric(10,2)`,
    })
    .from(restaurantOrders)
    .where(
      and(
        eq(restaurantOrders.cashRegisterId, cashRegisterId),
        inArray(restaurantOrders.status, ["preparing", "ready"]),
      ),
    );

  return { count: row?.count ?? 0, total: normalizeMoney(row?.total) };
}

function businessDateFor(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function normalizeMoney(value: string | null | undefined): string {
  return fromCents(toCents(value ?? "0.00"));
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
