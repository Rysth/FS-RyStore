import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { payments, restaurantOrderItems, restaurantOrders } from "../../db/schema.ts";
import { fromCents, toCents } from "../../lib/money.ts";
import { liveTotals } from "./cash-registers.ts";

export interface RestaurantDailyReport {
  cash_register_id: number;
  totals: {
    cash_total: string;
    transfer_total: string;
    card_total: string;
    platform_total: string;
    total_sales: string;
    orders_count: number;
    orders_paid_count: number;
  };
  top_products: Array<{
    product_name: string;
    quantity: number;
    revenue: string;
  }>;
  payment_methods: Array<{
    method: string;
    total: string;
    payments_count: number;
  }>;
}

export async function cashRegisterDailyReport(cashRegisterId: number): Promise<RestaurantDailyReport> {
  const totals = await liveTotals(cashRegisterId);
  const [topProducts, paymentMethods] = await Promise.all([
    topProductsFor(cashRegisterId),
    paymentMethodsFor(cashRegisterId),
  ]);

  return {
    cash_register_id: cashRegisterId,
    totals: {
      cash_total: totals.cashTotal,
      transfer_total: totals.transferTotal,
      card_total: totals.cardTotal,
      platform_total: totals.platformTotal,
      total_sales: totals.totalSales,
      orders_count: totals.ordersCount,
      orders_paid_count: totals.ordersPaidCount,
    },
    top_products: topProducts,
    payment_methods: paymentMethods,
  };
}

async function topProductsFor(cashRegisterId: number): Promise<RestaurantDailyReport["top_products"]> {
  const rows = await db
    .select({
      productName: restaurantOrderItems.productName,
      quantity: sql<number>`sum(${restaurantOrderItems.quantity})::int`,
      revenue: sql<string>`sum(${restaurantOrderItems.subtotal})::numeric(10,2)`,
    })
    .from(restaurantOrderItems)
    .innerJoin(restaurantOrders, eq(restaurantOrders.id, restaurantOrderItems.orderId))
    .where(
      and(
        eq(restaurantOrders.cashRegisterId, cashRegisterId),
        sql`${restaurantOrders.status} <> 'cancelled'`,
      ),
    )
    .groupBy(restaurantOrderItems.productName)
    .orderBy(desc(sql`sum(${restaurantOrderItems.subtotal})`))
    .limit(5);

  return rows.map((row) => ({
    product_name: row.productName,
    quantity: row.quantity,
    revenue: normalizeMoney(row.revenue),
  }));
}

async function paymentMethodsFor(cashRegisterId: number): Promise<RestaurantDailyReport["payment_methods"]> {
  const rows = await db
    .select({
      method: payments.paymentMethod,
      total: sql<string>`sum(${payments.amount})::numeric(10,2)`,
      paymentsCount: sql<number>`count(*)::int`,
    })
    .from(payments)
    .where(eq(payments.cashRegisterId, cashRegisterId))
    .groupBy(payments.paymentMethod)
    .orderBy(desc(sql`sum(${payments.amount})`));

  return rows.map((row) => ({
    method: row.method,
    total: normalizeMoney(row.total),
    payments_count: row.paymentsCount,
  }));
}

function normalizeMoney(value: string | null | undefined): string {
  return fromCents(toCents(value ?? "0.00"));
}
