import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { eq, like } from "drizzle-orm";
import { buildServer } from "../src/server.ts";
import { closeDatabase, db } from "../src/db/client.ts";
import { coupons, customers, orders, products } from "../src/db/schema.ts";
import { parseRange, csvCell } from "../src/routes/reports.ts";

/**
 * Reports and the commerce dashboard (phase 7).
 *
 * The suite plants three orders on "demo-camiseta" — two billable and one
 * cancelled — so it can assert the asymmetry the original had: revenue excludes
 * cancelled orders everywhere except the coupon report, which counts them
 * because a coupon's usage_count is not refunded on cancellation.
 */

const ORIGIN = "http://localhost:5173";
const PREFIX = "Test Reportes";
const PHONE = "0988001100";
const CODE = "TESTREPORTE";

let app: FastifyInstance;
let managerCookie = "";
let operatorCookie = "";
let ladderId = 0;

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/sign-in/email",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: { email, password: "password123" },
  });
  return response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

const get = (url: string, cookie = managerCookie) =>
  app.inject({ method: "GET", url, headers: { cookie, origin: ORIGIN } });

const post = (url: string, payload: unknown, cookie = managerCookie) =>
  app.inject({
    method: "POST",
    url,
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    payload: payload as object,
  });

before(async () => {
  app = await buildServer();
  await app.ready();
  managerCookie = await signIn("manager@example.com");
  operatorCookie = await signIn("operator@example.com");

  const [ladder] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "demo-camiseta"))
    .limit(1);
  assert.ok(ladder, "falta el catálogo demo — corre npm run db:seed:dev");
  ladderId = ladder.id;

  await post("/api/v1/coupons", {
    coupon: { code: CODE, discount_type: "fixed", discount_value: "3" },
  });

  const place = (couponCode?: string) =>
    post("/api/v1/orders", {
      order: {
        customer_name: `${PREFIX} Cliente`,
        phone: PHONE,
        address: "Av. Amazonas 100",
        payment_method: "efectivo",
        delivery_method: "domicilio",
      },
      items: [{ product_id: ladderId, quantity: 2 }],
      ...(couponCode ? { coupon_code: couponCode } : {}),
    });

  // Two billable orders of 20.00, plus one with the coupon that gets cancelled.
  assert.equal((await place()).statusCode, 201);
  assert.equal((await place()).statusCode, 201);

  const cancelled = await place(CODE);
  assert.equal(cancelled.statusCode, 201, cancelled.body);
  await app.inject({
    method: "PUT",
    url: `/api/v1/orders/${cancelled.json().order.id}/update_status`,
    headers: { cookie: managerCookie, origin: ORIGIN, "content-type": "application/json" },
    payload: { status: "cancelado" },
  });
});

after(async () => {
  await db.delete(orders).where(like(orders.customerName, `${PREFIX}%`));
  await db.delete(customers).where(eq(customers.phone, PHONE));
  await db.delete(coupons).where(eq(coupons.code, CODE));
  await db.update(products).set({ stock: 100 }).where(eq(products.id, ladderId));
  await app.close();
  await closeDatabase();
});

describe("rango de fechas", () => {
  const today = new Date("2026-08-27T12:00:00Z");

  it("por defecto son los últimos 30 días, agrupados por día", () => {
    const range = parseRange({}, today);
    assert.equal(range.to, "2026-08-27");
    assert.equal(range.from, "2026-07-28");
    assert.equal(range.byMonth, false);
  });

  it("un rango mayor a 31 días se agrupa por mes", () => {
    assert.equal(parseRange({ from: "2026-01-01", to: "2026-08-27" }, today).byMonth, true);
  });

  it("una fecha inválida cae al valor por defecto en lugar de reventar", () => {
    const range = parseRange({ from: "no-es-fecha", to: "tampoco" }, today);
    assert.equal(range.from, "2026-07-28");
    assert.equal(range.to, "2026-08-27");
  });

  it("un 'desde' posterior al 'hasta' colapsa en un solo día", () => {
    const range = parseRange({ from: "2026-08-20", to: "2026-08-10" }, today);
    assert.equal(range.from, "2026-08-10");
    assert.equal(range.to, "2026-08-10");
  });
});

describe("CSV", () => {
  it("entrecomilla comas, comillas y saltos de línea", () => {
    assert.equal(csvCell("simple"), "simple");
    assert.equal(csvCell("Camiseta, roja"), '"Camiseta, roja"');
    assert.equal(csvCell('Talla 15"'), '"Talla 15"""');
    assert.equal(csvCell("linea1\nlinea2"), '"linea1\nlinea2"');
    assert.equal(csvCell(42), "42");
  });
});

describe("reporte de ventas", () => {
  it("suma solo los pedidos facturables", async () => {
    const response = await get("/api/v1/reports/sales");
    assert.equal(response.statusCode, 200);

    const { summary } = response.json();
    assert.ok(summary.orders >= 2);
    assert.ok(Number(summary.revenue) >= 40, "dos pedidos de 20.00, sin el cancelado");
    assert.ok(Number(summary.average_order_value) > 0);
  });

  it("el promedio coincide con las filas que muestra", async () => {
    const { summary, rows } = (await get("/api/v1/reports/sales")).json();
    const orders = rows.reduce((sum: number, row: { orders: number }) => sum + row.orders, 0);
    const revenue = rows.reduce(
      (sum: number, row: { revenue: string }) => sum + Number(row.revenue),
      0,
    );

    assert.equal(orders, summary.orders);
    assert.equal(revenue.toFixed(2), Number(summary.revenue).toFixed(2));
  });

  it("exporta CSV con cabeceras en español y nombre fechado", async () => {
    const response = await get("/api/v1/reports/sales?export=csv");
    assert.equal(response.statusCode, 200);
    assert.match(response.headers["content-type"] as string, /text\/csv/);
    assert.match(
      response.headers["content-disposition"] as string,
      /attachment; filename="ventas-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    assert.ok(response.body.includes("fecha,pedidos,ingresos"));
  });
});

describe("reporte de productos", () => {
  it("agrupa por el nombre congelado en la línea", async () => {
    const response = await get("/api/v1/reports/products");
    assert.equal(response.statusCode, 200);

    const row = response.json().rows.find((r: { product_name: string }) => r.product_name === "Demo Camiseta");
    assert.ok(row, "el producto vendido debe aparecer");
    assert.ok(row.quantity >= 4, "dos pedidos de 2 unidades");
  });

  it("exporta CSV", async () => {
    const response = await get("/api/v1/reports/products?export=csv");
    assert.ok(response.body.includes("producto,cantidad,ingresos"));
  });
});

describe("reporte de clientes", () => {
  it("acumula por contacto excluyendo los cancelados", async () => {
    const response = await get("/api/v1/reports/customers");
    assert.equal(response.statusCode, 200);

    const row = response.json().rows.find((r: { phone: string }) => r.phone === PHONE);
    assert.ok(row);
    assert.equal(row.orders_count, 2);
    assert.equal(Number(row.total_spent), 40);
  });
});

describe("reporte de cupones", () => {
  it("cuenta el pedido cancelado, a diferencia de los demás reportes", async () => {
    const response = await get("/api/v1/reports/coupons");
    assert.equal(response.statusCode, 200);

    const row = response.json().rows.find((r: { code: string }) => r.code === CODE);
    assert.ok(row, "el cupón se gastó, aunque el pedido se cancelara");
    assert.equal(row.uses, 1);
    assert.equal(Number(row.total_discount), 3);
  });
});

describe("permisos", () => {
  it("un operator no ve reportes pero sí el dashboard", async () => {
    for (const url of ["sales", "products", "customers", "coupons"]) {
      assert.equal((await get(`/api/v1/reports/${url}`, operatorCookie)).statusCode, 403, url);
    }
    assert.equal((await get("/api/v1/dashboard/stats", operatorCookie)).statusCode, 200);
  });
});

describe("dashboard de comercio", () => {
  it("devuelve métricas de tienda, no de usuarios", async () => {
    const response = await get("/api/v1/dashboard/stats");
    assert.equal(response.statusCode, 200);

    const { stats } = response.json();
    assert.ok(!("total_users" in stats), "el dashboard del template quedó atrás");
    for (const key of [
      "total_orders",
      "pending_orders",
      "total_revenue",
      "average_order_value",
      "total_products",
      "low_stock_products",
      "total_categories",
    ]) {
      assert.ok(key in stats, `falta ${key}`);
    }
    assert.ok(stats.total_orders >= 3, "los cancelados cuentan como pedidos manejados");
    assert.ok(Number(stats.total_revenue) >= 40, "pero no como ingresos");
  });

  it("siempre trae los cinco estados y seis meses de tendencia", async () => {
    const body = (await get("/api/v1/dashboard/stats")).json();

    assert.deepEqual(
      body.order_statuses.map((row: { status: string }) => row.status),
      ["pendiente", "confirmado", "preparando", "entregado", "cancelado"],
    );
    assert.equal(body.sales_trend.length, 6);
    assert.match(body.sales_trend.at(-1).date, /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic) \d{4}$/);
  });

  it("lista los cinco pedidos más recientes", async () => {
    const { recent_orders } = (await get("/api/v1/dashboard/stats")).json();
    assert.ok(recent_orders.length > 0 && recent_orders.length <= 5);
    assert.ok(!("public_token" in recent_orders[0]));
  });
});
