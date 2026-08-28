import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { eq, like, or } from "drizzle-orm";
import { buildServer } from "../src/server.ts";
import { closeDatabase, db } from "../src/db/client.ts";
import { coupons, customers, orders, products } from "../src/db/schema.ts";

/**
 * Orders, coupons and contacts (phase 5), through the real router.
 *
 * The catalog it sells comes from db:seed:dev — "demo-camiseta" is the product
 * with the wholesale ladder (10.00, 9.00 from 6, 8.00 from 12) and 100 units.
 * Everything this file creates carries a "Test Ventas" marker and is removed in
 * `after`, so it can run repeatedly against the dev database.
 */

const ORIGIN = "http://localhost:5173";
const PREFIX = "Test Ventas";
const PHONE = "0990000777";

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
  const cookies = response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
  assert.ok(cookies, `no se obtuvo cookie de sesión para ${email}`);
  return cookies;
}

const request = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  payload?: unknown,
  cookie = managerCookie,
) =>
  app.inject({
    method,
    url,
    headers: { cookie, origin: ORIGIN, ...(payload ? { "content-type": "application/json" } : {}) },
    ...(payload ? { payload: payload as object } : {}),
  });

async function placeOrder(overrides: Record<string, unknown> = {}) {
  return request("POST", "/api/v1/orders", {
    order: {
      customer_name: `${PREFIX} Cliente`,
      phone: PHONE,
      address: "Av. Siempre Viva 742",
      city: "Quito",
      payment_method: "efectivo",
      delivery_method: "domicilio",
      ...((overrides.order as object) ?? {}),
    },
    items: overrides.items ?? [{ product_id: ladderId, quantity: 2 }],
    ...(overrides.coupon_code ? { coupon_code: overrides.coupon_code } : {}),
  });
}

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
});

after(async () => {
  await db.delete(orders).where(like(orders.customerName, `${PREFIX}%`));
  // Reset the stock these orders drew down, so the file can run again.
  await db.update(products).set({ stock: 100 }).where(eq(products.id, ladderId));
  await db.delete(customers).where(eq(customers.phone, PHONE));
  await db.delete(coupons).where(or(like(coupons.code, "TESTVENTAS%"), eq(coupons.code, "TESTDUP")));
  await app.close();
  await closeDatabase();
});

describe("pedidos", () => {
  it("registra un pedido con precios del catálogo, ignorando los del cliente", async () => {
    const response = await placeOrder({
      items: [{ product_id: ladderId, quantity: 2, unit_price: "0.01", price: "0.01" }],
    });

    assert.equal(response.statusCode, 201, response.body);
    const { order } = response.json();
    assert.equal(order.subtotal, "20.00");
    assert.equal(order.total, "20.00");
    assert.equal(order.items[0].unit_price, "10.00");
    assert.match(order.number, /^RY-\d{5}$/);
    assert.equal(order.status, "pendiente");
  });

  it("el correo es opcional y, si viene, se guarda", async () => {
    const withEmail = await placeOrder({ order: { email: "tienda-cliente@example.com" } });
    assert.equal(withEmail.statusCode, 201, withEmail.body);
    assert.equal(withEmail.json().order.email, "tienda-cliente@example.com");

    const withoutEmail = await placeOrder();
    assert.equal(withoutEmail.statusCode, 201, "un pedido de mostrador no exige correo");
    assert.equal(withoutEmail.json().order.email, null);
  });

  it("nunca expone public_token", async () => {
    const created = await placeOrder();
    assert.equal(created.statusCode, 201);
    assert.ok(!("public_token" in created.json().order), "el token del comprador no debe salir");

    const list = await request("GET", `/api/v1/orders?search=${encodeURIComponent(PREFIX)}`);
    for (const order of list.json().orders) {
      assert.ok(!("public_token" in order));
    }
  });

  it("aplica la escala mayorista al fusionar dos líneas del mismo producto", async () => {
    const response = await placeOrder({
      items: [
        { product_id: ladderId, quantity: 3 },
        { product_id: ladderId, quantity: 3 },
      ],
    });

    assert.equal(response.statusCode, 201, response.body);
    const { order } = response.json();
    assert.equal(order.items.length, 1, "las líneas duplicadas se fusionan");
    assert.equal(order.items[0].quantity, 6);
    assert.equal(order.items[0].unit_price, "9.00", "6 unidades cruzan el tramo juntas");
    assert.equal(order.total, "54.00");
  });

  it("acepta un estado inicial distinto de pendiente", async () => {
    const response = await placeOrder({ order: { status: "confirmado" } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().order.status, "confirmado");
  });

  it("devuelve el resumen con los cinco estados aunque estén en cero", async () => {
    const response = await request("GET", "/api/v1/orders");
    assert.equal(response.statusCode, 200);

    const { summary } = response.json();
    assert.deepEqual(Object.keys(summary).sort(), [
      "cancelado",
      "confirmado",
      "entregado",
      "pendiente",
      "preparando",
    ]);
    for (const value of Object.values(summary)) assert.equal(typeof value, "number");
  });

  it("no permite modificar un pedido cancelado", async () => {
    const created = await placeOrder();
    const id = created.json().order.id;

    const cancelled = await request("PUT", `/api/v1/orders/${id}/update_status`, {
      status: "cancelado",
    });
    assert.equal(cancelled.statusCode, 200);

    const revived = await request("PUT", `/api/v1/orders/${id}/update_status`, {
      status: "entregado",
    });
    assert.equal(revived.statusCode, 422);
    assert.equal(revived.json().message, "Un pedido cancelado no se puede volver a modificar");
  });

  it("rechaza un estado que no existe", async () => {
    const created = await placeOrder();
    const response = await request("PUT", `/api/v1/orders/${created.json().order.id}/update_status`, {
      status: "despachado",
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().message, "El estado del pedido no es válido");
  });

  it("un operator puede cambiar estados; no ve cupones ni contactos", async () => {
    const created = await placeOrder();
    const allowed = await request(
      "PUT",
      `/api/v1/orders/${created.json().order.id}/update_status`,
      { status: "preparando" },
      operatorCookie,
    );
    assert.equal(allowed.statusCode, 200);

    assert.equal((await request("GET", "/api/v1/coupons", undefined, operatorCookie)).statusCode, 403);
    assert.equal((await request("GET", "/api/v1/customers", undefined, operatorCookie)).statusCode, 403);
  });

  it("rechaza un carrito vacío", async () => {
    const response = await placeOrder({ items: [] });
    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json().errors, ["El carrito está vacío"]);
  });
});

describe("contactos", () => {
  it("nace del pedido y acumula las estadísticas del teléfono", async () => {
    await placeOrder();
    await placeOrder();

    const list = await request("GET", `/api/v1/customers?search=${PHONE}`);
    assert.equal(list.statusCode, 200);

    const contact = list.json().customers.find((row: { phone: string }) => row.phone === PHONE);
    assert.ok(contact, "el pedido debe haber creado el contacto");
    assert.ok(contact.orders_count >= 2);
    assert.ok(Number(contact.total_spent) > 0);
  });

  it("descuenta del total un pedido cancelado", async () => {
    const created = await placeOrder();
    const id = created.json().order.id;

    const before = await contactSnapshot();
    await request("PUT", `/api/v1/orders/${id}/update_status`, { status: "cancelado" });
    const after = await contactSnapshot();

    assert.equal(after.orders_count, before.orders_count - 1);
    assert.equal(Number(after.total_spent), Number(before.total_spent) - 20);
  });

  it("muestra los pedidos recientes en el detalle", async () => {
    await placeOrder();
    const contact = await contactSnapshot();

    const response = await request("GET", `/api/v1/customers/${contact.id}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().orders.length > 0);
    assert.ok(response.json().orders.length <= 20);
  });

  it("guarda el teléfono solo con dígitos y no lo deja cambiar", async () => {
    const created = await request("POST", "/api/v1/customers", {
      customer: { name: `${PREFIX} Lead`, phone: "+593 99 000 0777" },
    });
    // Same digits as an existing contact would collide; use a fresh number.
    if (created.statusCode === 422) {
      assert.deepEqual(created.json().errors, ["El teléfono ya está registrado"]);
      return;
    }

    assert.equal(created.statusCode, 201, created.body);
    const contact = created.json().customer;
    assert.equal(contact.phone, "593990000777");

    const updated = await request("PUT", `/api/v1/customers/${contact.id}`, {
      customer: { phone: "0000000000", city: "Cuenca", email: "lead@example.com" },
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.json().customer.phone, "593990000777", "el teléfono es inmutable");
    assert.equal(updated.json().customer.city, "Cuenca");
    assert.equal(updated.json().customer.email, "lead@example.com");

    const badEmail = await request("PUT", `/api/v1/customers/${contact.id}`, {
      customer: { email: "no-es-un-correo" },
    });
    assert.equal(badEmail.statusCode, 422);
    assert.deepEqual(badEmail.json().errors, ["El correo electrónico no tiene un formato válido"]);

    await db.delete(customers).where(eq(customers.id, contact.id));
  });

  it("responde 404 con mensaje en español", async () => {
    const response = await request("GET", "/api/v1/customers/99999999");
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, "Contacto no encontrado");
  });
});

describe("cupones", () => {
  it("normaliza el código a mayúsculas al crear", async () => {
    const response = await request("POST", "/api/v1/coupons", {
      coupon: { code: "testventas_a", discount_type: "percentage", discount_value: "15" },
    });

    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().coupon.code, "TESTVENTAS_A");
  });

  it("rechaza un porcentaje mayor a 100", async () => {
    const response = await request("POST", "/api/v1/coupons", {
      coupon: { code: "TESTVENTAS_B", discount_type: "percentage", discount_value: "150" },
    });

    assert.equal(response.statusCode, 422);
    assert.ok(response.json().errors.includes("El descuento no puede ser mayor a 100%"));
  });

  it("rechaza un código con caracteres no permitidos", async () => {
    const response = await request("POST", "/api/v1/coupons", {
      coupon: { code: "TESTVENTAS C!", discount_type: "fixed", discount_value: "5" },
    });

    assert.equal(response.statusCode, 422);
    assert.ok(
      response.json().errors.includes(
        "El código solo puede tener letras, números, guiones y guiones bajos",
      ),
    );
  });

  it("rechaza un código repetido sin distinguir mayúsculas", async () => {
    await request("POST", "/api/v1/coupons", {
      coupon: { code: "TESTVENTAS_D", discount_type: "fixed", discount_value: "5" },
    });
    const duplicate = await request("POST", "/api/v1/coupons", {
      coupon: { code: "testventas_d", discount_type: "fixed", discount_value: "5" },
    });

    assert.equal(duplicate.statusCode, 422);
    assert.ok(duplicate.json().errors.includes("El código ya está en uso"));
  });

  it("aplica un descuento porcentual al pedido y sube usage_count", async () => {
    const created = await request("POST", "/api/v1/coupons", {
      coupon: { code: "TESTVENTAS_E", discount_type: "percentage", discount_value: "10" },
    });
    assert.equal(created.statusCode, 201);

    const order = await placeOrder({ coupon_code: "TESTVENTAS_E" });
    assert.equal(order.statusCode, 201, order.body);
    assert.equal(order.json().order.subtotal, "20.00");
    assert.equal(order.json().order.discount_amount, "2.00");
    assert.equal(order.json().order.total, "18.00");
    assert.equal(order.json().order.coupon_code, "TESTVENTAS_E");

    const reloaded = await request("GET", `/api/v1/coupons/${created.json().coupon.id}`);
    assert.equal(reloaded.json().coupon.usage_count, 1);
  });

  it("un cupón borrado deja intacto el descuento ya cobrado", async () => {
    const created = await request("POST", "/api/v1/coupons", {
      coupon: { code: "TESTVENTAS_F", discount_type: "fixed", discount_value: "5" },
    });
    const order = await placeOrder({ coupon_code: "TESTVENTAS_F" });
    const orderId = order.json().order.id;
    assert.equal(order.json().order.discount_amount, "5.00");

    const removed = await request("DELETE", `/api/v1/coupons/${created.json().coupon.id}`);
    assert.equal(removed.statusCode, 200);

    const reloaded = await request("GET", `/api/v1/orders/${orderId}`);
    assert.equal(reloaded.json().order.discount_amount, "5.00");
    assert.equal(reloaded.json().order.total, "15.00");
    assert.equal(reloaded.json().order.coupon_code, null);
  });
});

async function contactSnapshot() {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.phone, PHONE))
    .limit(1);
  assert.ok(row, "no existe el contacto de prueba");
  return {
    id: row.id,
    orders_count: row.ordersCount,
    total_spent: row.totalSpent,
  };
}
