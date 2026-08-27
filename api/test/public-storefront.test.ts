import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { eq, like } from "drizzle-orm";
import { buildServer } from "../src/server.ts";
import { closeDatabase, db } from "../src/db/client.ts";
import { businesses, orders, products } from "../src/db/schema.ts";
import { getBusiness } from "../src/services/business.ts";

/**
 * The storefront API (phase 6). Runs against the db:seed:dev catalog:
 * "demo-camiseta" (10.00, ladder from 6 and 12, 100 units), "demo-zapato"
 * (two variant axes, the 39 priced on its own), "demo-asesoria" (a service),
 * "demo-sticker" (untracked stock) and "demo-combo-basico".
 */

const ORIGIN = "http://localhost:4321";
const PREFIX = "Test Tienda";

let app: FastifyInstance;
let businessId = 0;

const get = (url: string) => app.inject({ method: "GET", url, headers: { origin: ORIGIN } });
const post = (url: string, payload: unknown) =>
  app.inject({
    method: "POST",
    url,
    headers: { origin: ORIGIN, "content-type": "application/json" },
    payload: payload as object,
  });

before(async () => {
  app = await buildServer();
  await app.ready();
  businessId = (await getBusiness()).id;
});

after(async () => {
  await db.update(businesses).set({ published: true }).where(eq(businesses.id, businessId));
  await db.delete(orders).where(like(orders.customerName, `${PREFIX}%`));
  const [ladder] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "demo-camiseta"))
    .limit(1);
  if (ladder) await db.update(products).set({ stock: 100 }).where(eq(products.id, ladder.id));
  await app.close();
  await closeDatabase();
});

describe("tienda", () => {
  it("nunca expone notification_email", async () => {
    const store = await get("/api/v1/public/store");
    assert.equal(store.statusCode, 200);
    assert.ok(!("notification_email" in store.json().store), "el correo del dueño no debe salir");

    const business = await get("/api/v1/public/business");
    assert.ok(!("notification_email" in business.json().business));
  });

  it("responde con la cabecera CORS del storefront y sin credenciales", async () => {
    const response = await get("/api/v1/public/store");
    assert.equal(response.headers["access-control-allow-origin"], ORIGIN);
    assert.equal(
      response.headers["access-control-allow-credentials"],
      undefined,
      "nada en /public es de sesión",
    );
  });
});

describe("catálogo", () => {
  it("lista solo productos activos con su ficha completa", async () => {
    const response = await get("/api/v1/public/products?per_page=50");
    assert.equal(response.statusCode, 200);

    const camiseta = response.json().products.find((p: { slug: string }) => p.slug === "demo-camiseta");
    assert.ok(camiseta);
    assert.equal(camiseta.price, "10.00");
    assert.deepEqual(camiseta.price_tiers, [
      { min_quantity: 6, unit_price: "9.00" },
      { min_quantity: 12, unit_price: "8.00" },
    ]);
    assert.equal(camiseta.category_slug, "demo-general");
  });

  it("resuelve el precio de cada variante, herencia incluida", async () => {
    const response = await get("/api/v1/public/products/demo-zapato");
    assert.equal(response.statusCode, 200);

    const { variants } = response.json().product;
    assert.ok(variants.length > 0);
    const priced = variants.find((v: { price: string }) => v.price === "55.00");
    assert.ok(priced, "la 39 tiene precio propio");
    const inherited = variants.find((v: { price: string }) => v.price === "50.00");
    assert.ok(inherited, "las demás heredan el precio del producto");
  });

  it("una categoría inexistente da lista vacía, no 404", async () => {
    const response = await get("/api/v1/public/products?category=no-existe");
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().products, []);
    assert.deepEqual(response.json().pagination, {
      current_page: 1,
      total_pages: 0,
      total_count: 0,
      per_page: 12,
    });
  });

  it("ignora filtros de precio con basura y negativos", async () => {
    const clean = await get("/api/v1/public/products?per_page=50");
    const junk = await get("/api/v1/public/products?per_page=50&min_price=abc&max_price=-5");

    assert.equal(junk.statusCode, 200);
    assert.equal(junk.json().pagination.total_count, clean.json().pagination.total_count);
  });

  it("intercambia los límites de precio invertidos", async () => {
    const swapped = await get("/api/v1/public/products?min_price=40&max_price=5&per_page=50");
    const normal = await get("/api/v1/public/products?min_price=5&max_price=40&per_page=50");

    assert.equal(swapped.statusCode, 200);
    assert.equal(
      swapped.json().pagination.total_count,
      normal.json().pagination.total_count,
      "un slider arrastrado de más no es una página vacía",
    );
  });

  it("ordena por precio ascendente y cae al orden por defecto con un sort inventado", async () => {
    const asc = await get("/api/v1/public/products?sort=precio_asc&per_page=50");
    const prices = asc.json().products.map((p: { price: string }) => Number(p.price));
    assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

    const bogus = await get("/api/v1/public/products?sort=DROP TABLE&per_page=50");
    assert.equal(bogus.statusCode, 200);
  });

  it("la ficha trae relacionados y 404 en español si no existe", async () => {
    const found = await get("/api/v1/public/products/demo-camiseta");
    assert.equal(found.statusCode, 200);
    assert.ok(Array.isArray(found.json().related));
    assert.ok(found.json().related.length <= 4);
    assert.ok(
      !found.json().related.some((p: { slug: string }) => p.slug === "demo-camiseta"),
      "un producto no es su propio relacionado",
    );

    const missing = await get("/api/v1/public/products/no-existe");
    assert.equal(missing.statusCode, 404);
    assert.equal(missing.json().message, "Producto no encontrado");
  });

  it("los combos traen sus productos completos", async () => {
    const response = await get("/api/v1/public/promotions");
    assert.equal(response.statusCode, 200);

    const combo = response.json().promotions.find((p: { slug: string }) => p.slug === "demo-combo-basico");
    assert.ok(combo, "el combo demo debe estar vigente");
    assert.equal(combo.price, "12.00");
    assert.ok(Number(combo.regular_total) > Number(combo.price));
    assert.ok(combo.items.every((item: { product: { slug: string } }) => item.product.slug));
  });
});

describe("cupones", () => {
  it("previsualiza el descuento sin gastar el cupón", async () => {
    const [camiseta] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "demo-camiseta"))
      .limit(1);

    const response = await post("/api/v1/public/coupons/validate", {
      code: "demo10",
      items: [{ product_id: camiseta!.id, quantity: 2 }],
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().subtotal, "20.00");
    assert.equal(response.json().discount_amount, "2.00");
    assert.equal(response.json().total, "18.00");
  });

  it("rechaza un cupón agotado con el mensaje de Rails", async () => {
    const response = await post("/api/v1/public/coupons/validate", {
      code: "DEMOAGOTADO",
      items: [],
    });

    assert.equal(response.statusCode, 422);
    assert.equal(
      response.json().message,
      "El cupón no es válido, expiró o alcanzó su límite de uso",
    );
  });
});

describe("checkout", () => {
  const checkout = (overrides: Record<string, unknown> = {}) =>
    post("/api/v1/public/orders", {
      order: {
        customer_name: `${PREFIX} Comprador`,
        phone: "0991112223",
        address: "Calle Falsa 123",
        city: "Guayaquil",
        payment_method: "transferencia",
        delivery_method: "domicilio",
        ...((overrides.order as object) ?? {}),
      },
      items: overrides.items ?? [],
    });

  let ladderId = 0;

  before(async () => {
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "demo-camiseta"))
      .limit(1);
    ladderId = row!.id;
  });

  it("devuelve token, mensaje y enlace de WhatsApp", async () => {
    const response = await checkout({ items: [{ product_id: ladderId, quantity: 2 }] });

    assert.equal(response.statusCode, 201, response.body);
    const body = response.json();
    assert.equal(body.order.total, "20.00");
    assert.ok(body.order.token, "el comprador necesita su token");
    assert.equal(body.order.payment_proof_required, true);
    assert.match(body.whatsapp_message, /Nuevo pedido RY-\d{5}/);
  });

  it("un honeypot lleno responde con el mensaje genérico", async () => {
    const response = await checkout({
      order: { checkout_fax_confirmation: "soy un bot" },
      items: [{ product_id: ladderId, quantity: 1 }],
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().message, "No se pudo registrar el pedido");
    assert.deepEqual(response.json().errors, [], "no le digas al bot qué campo lo delató");
  });

  it("el pedido se consulta por token y nunca por número", async () => {
    const created = await checkout({ items: [{ product_id: ladderId, quantity: 1 }] });
    const { token, number } = created.json().order;

    const byToken = await get(`/api/v1/public/orders/${token}`);
    assert.equal(byToken.statusCode, 200);
    assert.equal(byToken.json().order.number, number);
    assert.ok(!("public_token" in byToken.json().order));

    const byNumber = await get(`/api/v1/public/orders/${number}`);
    assert.equal(byNumber.statusCode, 404, "el número es secuencial y no autoriza nada");
  });

  it("cancela una transferencia sin comprobante, y solo esa vez", async () => {
    const created = await checkout({ items: [{ product_id: ladderId, quantity: 1 }] });
    const { token } = created.json().order;

    const first = await post(`/api/v1/public/orders/${token}/cancel`, {});
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().order.status, "cancelado");

    const second = await post(`/api/v1/public/orders/${token}/cancel`, {});
    assert.equal(second.statusCode, 200, "cancelar dos veces es idempotente");
  });

  it("no deja cancelar un pedido en efectivo", async () => {
    const created = await checkout({
      order: { payment_method: "efectivo" },
      items: [{ product_id: ladderId, quantity: 1 }],
    });

    const response = await post(`/api/v1/public/orders/${created.json().order.token}/cancel`, {});
    assert.equal(response.statusCode, 422);
    assert.equal(response.json().message, "Este pedido ya no se puede cancelar desde la tienda");
  });
});

describe("tienda despublicada", () => {
  let token = "";

  before(async () => {
    const [ladder] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, "demo-camiseta"))
      .limit(1);

    const created = await post("/api/v1/public/orders", {
      order: {
        customer_name: `${PREFIX} Antes`,
        phone: "0994445556",
        address: "Calle Falsa 123",
        payment_method: "transferencia",
        delivery_method: "domicilio",
      },
      items: [{ product_id: ladder!.id, quantity: 1 }],
    });
    assert.equal(created.statusCode, 201, created.body);
    token = created.json().order.token;

    await db.update(businesses).set({ published: false }).where(eq(businesses.id, businessId));
  });

  after(async () => {
    await db.update(businesses).set({ published: true }).where(eq(businesses.id, businessId));
  });

  it("cierra el catálogo con 503 en español", async () => {
    for (const url of [
      "/api/v1/public/products",
      "/api/v1/public/categories",
      "/api/v1/public/promotions",
      "/api/v1/public/products/demo-camiseta",
    ]) {
      const response = await get(url);
      assert.equal(response.statusCode, 503, url);
      assert.equal(
        response.json().message,
        "La tienda no está disponible en este momento. Vuelve pronto.",
      );
    }
  });

  it("deja abierta la tienda para su página de 'volvemos pronto'", async () => {
    const response = await get("/api/v1/public/store");
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().store.published, false);
    assert.ok(response.json().store.name, "la página cerrada muestra su propio nombre");
  });

  it("un pedido ya hecho sigue siendo accesible", async () => {
    const response = await get(`/api/v1/public/orders/${token}`);
    assert.equal(response.statusCode, 200, "su comprador ya pagó o está por hacerlo");
  });

  it("pero no se aceptan pedidos nuevos", async () => {
    const response = await post("/api/v1/public/orders", {
      order: {
        customer_name: `${PREFIX} Tarde`,
        phone: "0996667778",
        payment_method: "efectivo",
        delivery_method: "retiro",
      },
      items: [{ product_id: 1, quantity: 1 }],
    });
    assert.equal(response.statusCode, 503);
  });
});
