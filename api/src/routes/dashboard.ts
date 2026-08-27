import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { ORDER_STATUSES } from "../db/schema.ts";
import { ok } from "../lib/response.ts";

/**
 * GET /api/v1/dashboard/stats
 *
 * Ported from Api::V1::DashboardController. The Rails version issued a separate
 * COUNT for every figure — including four inside a six-iteration loop for the
 * sales trend, so roughly thirty round trips per request, which is why it
 * needed a two-minute cache to feel acceptable. Here it is four queries and the
 * cache is gone.
 *
 * Cancelled orders never became real business, so every revenue figure excludes
 * them while the order *counts* include them: the shop still handled those.
 */

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** A product at or below this is what the dashboard flags as "por acabarse". */
const LOW_STOCK_THRESHOLD = 5;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/dashboard/stats",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_DASHBOARD) },
    async (_request, reply) => {
      // One pass over `orders` for every headline figure. `date_trunc('week')`
      // is Monday-based in Postgres, matching Rails' beginning_of_week.
      const ordersQuery = pool.query<Record<string, string>>(`
        SELECT
          count(*)                                                                 AS total,
          count(*) FILTER (WHERE status = 'pendiente')                             AS pending,
          count(*) FILTER (WHERE created_at >= date_trunc('day', now()))           AS today,
          count(*) FILTER (WHERE created_at >= date_trunc('week', now()))          AS this_week,
          count(*) FILTER (WHERE created_at >= date_trunc('month', now()))         AS this_month,
          count(*) FILTER (WHERE created_at >= date_trunc('month', now()) - interval '1 month'
                             AND created_at <  date_trunc('month', now()))         AS last_month,
          count(*) FILTER (WHERE status <> 'cancelado')                            AS billable,
          coalesce(sum(total) FILTER (WHERE status <> 'cancelado'), 0)::numeric(12,2) AS revenue,
          coalesce(sum(total) FILTER (WHERE status <> 'cancelado'
                             AND created_at >= date_trunc('month', now())), 0)::numeric(12,2) AS revenue_this_month,
          coalesce(sum(total) FILTER (WHERE status <> 'cancelado'
                             AND created_at >= date_trunc('month', now()) - interval '1 month'
                             AND created_at <  date_trunc('month', now())), 0)::numeric(12,2) AS revenue_last_month
        FROM orders
      `);

      const catalogQuery = pool.query<Record<string, string>>(`
        SELECT
          (SELECT count(*) FROM products)                                        AS total_products,
          (SELECT count(*) FROM products WHERE active)                           AS active_products,
          (SELECT count(*) FROM products
            WHERE stock IS NOT NULL AND stock <= ${LOW_STOCK_THRESHOLD})         AS low_stock_products,
          (SELECT count(*) FROM categories)                                      AS total_categories
      `);

      // Six months in one grouped query instead of a loop. generate_series
      // keeps a month with no orders in the chart as a zero rather than a gap.
      const trendQuery = pool.query<{
        month: string;
        orders: string;
        revenue: string;
      }>(`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now()) - interval '5 months',
            date_trunc('month', now()),
            interval '1 month'
          ) AS month
        )
        SELECT to_char(m.month, 'YYYY-MM')                                       AS month,
               count(o.id)                                                       AS orders,
               coalesce(sum(o.total) FILTER (WHERE o.status <> 'cancelado'), 0)::numeric(12,2) AS revenue
          FROM months m
          LEFT JOIN orders o ON date_trunc('month', o.created_at) = m.month
         GROUP BY m.month
         ORDER BY m.month
      `);

      const statusQuery = pool.query<{ status: string; count: string }>(`
        SELECT status, count(*) AS count FROM orders GROUP BY status
      `);

      const recentQuery = pool.query<{
        id: string;
        number: string | null;
        customer_name: string;
        total: string;
        status: string;
        payment_method: string;
        created_at: Date;
      }>(`
        SELECT id, number, customer_name, total, status, payment_method, created_at
          FROM orders
         ORDER BY created_at DESC, id DESC
         LIMIT 5
      `);

      const [ordersResult, catalogResult, trendResult, statusResult, recentResult] =
        await Promise.all([ordersQuery, catalogQuery, trendQuery, statusQuery, recentQuery]);

      const orders = ordersResult.rows[0]!;
      const catalog = catalogResult.rows[0]!;
      const count = (value: string | undefined) => Number.parseInt(value ?? "0", 10);

      const billable = count(orders.billable);
      const revenue = Number(orders.revenue);
      const revenueThisMonth = Number(orders.revenue_this_month);
      const revenueLastMonth = Number(orders.revenue_last_month);

      const growthPercentage =
        revenueLastMonth > 0
          ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 1000) / 10
          : revenueThisMonth > 0
            ? 100
            : 0;

      const statusCounts = new Map(statusResult.rows.map((row) => [row.status, count(row.count)]));

      return ok(reply, {
        stats: {
          total_orders: count(orders.total),
          pending_orders: count(orders.pending),
          orders_today: count(orders.today),
          orders_this_week: count(orders.this_week),
          orders_this_month: count(orders.this_month),
          orders_last_month: count(orders.last_month),
          total_revenue: orders.revenue!,
          revenue_this_month: orders.revenue_this_month!,
          revenue_last_month: orders.revenue_last_month!,
          growth_percentage: growthPercentage,
          average_order_value: billable > 0 ? (revenue / billable).toFixed(2) : "0.00",
          total_products: count(catalog.total_products),
          active_products: count(catalog.active_products),
          low_stock_products: count(catalog.low_stock_products),
          total_categories: count(catalog.total_categories),
        },
        // Always all five, with zeros — the chart keeps its legend when a shop
        // has never cancelled anything.
        order_statuses: ORDER_STATUSES.map((status) => ({
          status,
          label: capitalize(status),
          count: statusCounts.get(status) ?? 0,
        })),
        sales_trend: trendResult.rows.map((row) => {
          const [year, month] = row.month.split("-");
          return {
            date: `${MONTHS_ES[Number.parseInt(month!, 10) - 1]} ${year}`,
            month: row.month,
            orders: count(row.orders),
            revenue: row.revenue,
          };
        }),
        recent_orders: recentResult.rows.map((row) => ({
          id: Number(row.id),
          number: row.number,
          customer_name: row.customer_name,
          total: row.total,
          status: row.status,
          payment_method: row.payment_method,
          created_at: row.created_at.toISOString(),
        })),
      });
    },
  );

  await Promise.resolve();
}
