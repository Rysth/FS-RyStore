import type { FastifyInstance, FastifyReply } from "fastify";
import { pool } from "../db/client.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { ok } from "../lib/response.ts";
import { addCents, fromCents, toCents, ZERO } from "../lib/money.ts";

/**
 * Port of Api::V1::ReportsController.
 *
 * Deeper, date-ranged breakdowns than the dashboard's fixed six months. Kept
 * behind its own permission (view_reports) rather than folded into
 * view_dashboard: it exposes more granular business data than the summary
 * cards do.
 *
 * `?export=csv` returns the same rows as a file instead of JSON.
 */

const DEFAULT_DAYS = 30;

export type DateRange = { from: string; to: string; byMonth: boolean };

/**
 * A malformed date falls back to the default window rather than 500 — these
 * arrive from a URL the shop can edit, and a report is not worth an error page.
 * A `from` after `to` collapses to a single day.
 */
export function parseRange(query: { from?: unknown; to?: unknown }, today = new Date()): DateRange {
  const to = parseDate(query.to) ?? isoDate(today);
  const fallbackFrom = new Date(today);
  fallbackFrom.setUTCDate(fallbackFrom.getUTCDate() - DEFAULT_DAYS);

  let from = parseDate(query.from) ?? isoDate(fallbackFrom);
  if (from > to) from = to;

  // Past a month, a per-day chart is unreadable; the shop wants the shape of
  // the year, not 400 bars.
  const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;

  return { from, to, byMonth: spanDays > 31 };
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoDate(parsed);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Inclusive of the whole `to` day, which is what a shop means by "hasta". */
function bounds(range: DateRange): [string, string] {
  return [`${range.from} 00:00:00`, `${range.to} 23:59:59.999999`];
}

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  const canRead = { preHandler: requirePermission(PERMISSION_KEYS.VIEW_REPORTS) };

  // GET /api/v1/reports/sales
  app.get("/api/v1/reports/sales", canRead, async (request, reply) => {
    const range = parseRange(request.query as Record<string, unknown>);
    const [start, end] = bounds(range);
    const bucket = range.byMonth ? "month" : "day";
    const format = range.byMonth ? "YYYY-MM" : "YYYY-MM-DD";

    const { rows } = await pool.query<{ date: string; orders: string; revenue: string }>(
      `SELECT to_char(date_trunc($3, created_at), $4) AS date,
              count(*)              AS orders,
              coalesce(sum(total), 0)::numeric(12,2) AS revenue
         FROM orders
        WHERE status <> 'cancelado'
          AND created_at BETWEEN $1 AND $2
        GROUP BY date_trunc($3, created_at)
        ORDER BY date_trunc($3, created_at)`,
      [start, end, bucket, format],
    );

    const data = rows.map((row) => ({
      date: row.date,
      orders: Number(row.orders),
      revenue: row.revenue,
    }));

    if (wantsCsv(request.query)) {
      return sendCsv(reply, "ventas", ["fecha", "pedidos", "ingresos"], [
        ...data.map((row) => [row.date, row.orders, row.revenue]),
      ]);
    }

    const totalOrders = data.reduce((sum, row) => sum + row.orders, 0);
    const totalRevenue = data.reduce((sum, row) => addCents(sum, toCents(row.revenue)), ZERO);

    return ok(reply, {
      rows: data,
      summary: {
        orders: totalOrders,
        revenue: fromCents(totalRevenue),
        // Integer cents throughout, so the average never drifts from the sum
        // of the rows the shop is looking at.
        average_order_value: totalOrders > 0 ? fromCents(totalRevenue / BigInt(totalOrders)) : "0.00",
      },
      from: range.from,
      to: range.to,
    });
  });

  // GET /api/v1/reports/products — top 20 by revenue.
  app.get("/api/v1/reports/products", canRead, async (request, reply) => {
    const range = parseRange(request.query as Record<string, unknown>);
    const [start, end] = bounds(range);

    // Grouped on the frozen product_name, not on product_id: a product deleted
    // from the catalog still sold what it sold, and dropping it would make the
    // report disagree with the orders it came from.
    const { rows } = await pool.query<{ product_name: string; quantity: string; revenue: string }>(
      `SELECT oi.product_name,
              sum(oi.quantity) AS quantity,
              sum(oi.subtotal) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE o.status <> 'cancelado'
          AND o.created_at BETWEEN $1 AND $2
        GROUP BY oi.product_name
        ORDER BY revenue DESC
        LIMIT 20`,
      [start, end],
    );

    const data = rows.map((row) => ({
      product_name: row.product_name,
      quantity: Number(row.quantity),
      revenue: row.revenue,
    }));

    if (wantsCsv(request.query)) {
      return sendCsv(reply, "productos", ["producto", "cantidad", "ingresos"], [
        ...data.map((row) => [row.product_name, row.quantity, row.revenue]),
      ]);
    }

    return ok(reply, { rows: data, from: range.from, to: range.to });
  });

  // GET /api/v1/reports/customers — top 20 by spend.
  app.get("/api/v1/reports/customers", canRead, async (request, reply) => {
    const range = parseRange(request.query as Record<string, unknown>);
    const [start, end] = bounds(range);

    const { rows } = await pool.query<{
      customer_id: string;
      name: string | null;
      phone: string | null;
      orders_count: string;
      total_spent: string;
    }>(
      `SELECT o.customer_id, c.name, c.phone,
              count(*)     AS orders_count,
              sum(o.total) AS total_spent
         FROM orders o
         LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.status <> 'cancelado'
          AND o.customer_id IS NOT NULL
          AND o.created_at BETWEEN $1 AND $2
        GROUP BY o.customer_id, c.name, c.phone
        ORDER BY total_spent DESC
        LIMIT 20`,
      [start, end],
    );

    const data = rows.map((row) => ({
      customer_id: Number(row.customer_id),
      name: row.name,
      phone: row.phone,
      orders_count: Number(row.orders_count),
      total_spent: row.total_spent,
    }));

    if (wantsCsv(request.query)) {
      return sendCsv(reply, "clientes", ["nombre", "telefono", "pedidos", "total_gastado"], [
        ...data.map((row) => [row.name ?? "", row.phone ?? "", row.orders_count, row.total_spent]),
      ]);
    }

    return ok(reply, { rows: data, from: range.from, to: range.to });
  });

  /**
   * GET /api/v1/reports/coupons
   *
   * Two deliberate asymmetries with the reports above, both carried over from
   * Rails: no LIMIT, and cancelled orders are counted. A coupon's usage_count
   * is not decremented when an order is cancelled, so counting only billable
   * orders here would make this report disagree with the coupon's own counter.
   */
  app.get("/api/v1/reports/coupons", canRead, async (request, reply) => {
    const range = parseRange(request.query as Record<string, unknown>);
    const [start, end] = bounds(range);

    const { rows } = await pool.query<{
      coupon_id: string;
      code: string | null;
      uses: string;
      total_discount: string;
    }>(
      `SELECT o.coupon_id, c.code,
              count(*)               AS uses,
              sum(o.discount_amount) AS total_discount
         FROM orders o
         LEFT JOIN coupons c ON c.id = o.coupon_id
        WHERE o.coupon_id IS NOT NULL
          AND o.created_at BETWEEN $1 AND $2
        GROUP BY o.coupon_id, c.code
        ORDER BY total_discount DESC`,
      [start, end],
    );

    const data = rows.map((row) => ({
      coupon_id: Number(row.coupon_id),
      code: row.code,
      uses: Number(row.uses),
      total_discount: row.total_discount,
    }));

    if (wantsCsv(request.query)) {
      return sendCsv(reply, "cupones", ["codigo", "usos", "descuento_total"], [
        ...data.map((row) => [row.code ?? "", row.uses, row.total_discount]),
      ]);
    }

    return ok(reply, { rows: data, from: range.from, to: range.to });
  });

  await Promise.resolve();
}

function wantsCsv(query: unknown): boolean {
  return (query as { export?: string })?.export === "csv";
}

/** Minimal RFC 4180: quote when the value contains a comma, quote or newline. */
export function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sendCsv(
  reply: FastifyReply,
  resource: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): FastifyReply {
  const body = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return reply
    .type("text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${resource}-${stamp}.csv"`)
    // A BOM so Excel on Windows reads the accents in "código" correctly —
    // without it the shop opens the file to mojibake.
    .send(`﻿${body}`);
}
