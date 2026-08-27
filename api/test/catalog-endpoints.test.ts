import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { eq, inArray, like } from "drizzle-orm";
import { buildServer } from "../src/server.ts";
import { closeDatabase, db } from "../src/db/client.ts";
import { categories, products, promotions } from "../src/db/schema.ts";

/**
 * Catalog admin endpoints (phase 3), through the real router with a real
 * session cookie so the permission gates are in the path.
 *
 * Everything this file creates is prefixed "Test " and removed in `after`, so
 * it can run repeatedly against the dev database without piling up rows.
 */

const ORIGIN = "http://localhost:5173";
const PREFIX = "Test Catálogo";

let app: FastifyInstance;
let managerCookie = "";
let operatorCookie = "";
let categoryId = 0;

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

before(async () => {
  app = await buildServer();
  await app.ready();
  managerCookie = await signIn("manager@example.com");
  operatorCookie = await signIn("operator@example.com");

  const created = await request("POST", "/api/v1/categories", { name: `${PREFIX} Categoría` });
  assert.equal(created.statusCode, 201, created.body);
  categoryId = created.json().category.id;
});

after(async () => {
  await db.delete(promotions).where(like(promotions.name, `${PREFIX}%`));
  await db.delete(products).where(like(products.name, `${PREFIX}%`));
  await db.delete(categories).where(like(categories.name, `${PREFIX}%`));
  await app.close();
  await closeDatabase();
});

describe("categorías", () => {
  it("crea con slug único y posición al final", async () => {
    const response = await request("POST", "/api/v1/categories", { name: `${PREFIX} Segunda` });
    assert.equal(response.statusCode, 201);
    const { category } = response.json();
    assert.equal(category.slug, "test-catalogo-segunda");
    assert.ok(category.position > 0);
  });

  it("rechaza un nombre repetido sin distinguir mayúsculas", async () => {
    const response = await request("POST", "/api/v1/categories", {
      name: `${PREFIX} CATEGORÍA`.toUpperCase(),
    });
    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json().errors, ["El nombre ya está en uso"]);
  });

  it("un operator puede leer pero no escribir", async () => {
    const read = await request("GET", "/api/v1/categories", undefined, operatorCookie);
    assert.equal(read.statusCode, 200);

    const write = await request("POST", "/api/v1/categories", { name: "X" }, operatorCookie);
    assert.equal(write.statusCode, 403);
  });
});

describe("productos", () => {
  it("crea con escalera, la devuelve ordenada y calcula el stock total", async () => {
    const response = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Camiseta`,
        price: "10.00",
        stock: 100,
        category_id: categoryId,
        price_tiers: [
          { min_quantity: 12, unit_price: "8.00" },
          { min_quantity: 6, unit_price: "9.00" },
        ],
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    const { product } = response.json();
    assert.deepEqual(product.price_tiers, [
      { min_quantity: 6, unit_price: "9.00" },
      { min_quantity: 12, unit_price: "8.00" },
    ]);
    assert.equal(product.total_stock, 100);
    assert.equal(product.category_name, `${PREFIX} Categoría`);
  });

  it("rechaza una escalera que no baja", async () => {
    const response = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Mala`,
        price: "10.00",
        price_tiers: [
          { min_quantity: 6, unit_price: "9.00" },
          { min_quantity: 12, unit_price: "9.50" },
        ],
      },
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.json().message, "No se pudo crear el producto");
    assert.ok(
      response.json().errors.some((error: string) => error.includes("menor al del tramo anterior")),
    );
  });

  it("sanea la descripción y descarta el contenido del script", async () => {
    const response = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Descrita`,
        price: "5.00",
        description: "<p>Hola <b>mundo</b></p><script>alert(1)</script>",
      },
    });

    assert.equal(response.statusCode, 201);
    const { description } = response.json().product;
    assert.ok(!description.includes("alert(1)"), "el cuerpo del script no debe sobrevivir");
    assert.ok(description.includes("<b>mundo</b>"));
  });

  it("preserva el stock de una variante cuando se reenvía la matriz completa", async () => {
    const created = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Zapato`,
        price: "50.00",
        option_types: [{ name: "Talla", values: ["38", "39"] }],
        variants: [
          { options: { Talla: "38" }, stock: 7 },
          { options: { Talla: "39" }, stock: 3, price: "55.00" },
        ],
      },
    });
    assert.equal(created.statusCode, 201, created.body);

    const before = created.json().product.variants;
    assert.equal(before.length, 2);
    assert.equal(before[0].label, "Talla: 38");

    // Same combinations, reordered and with the axis values extended: the ids
    // must survive, or every past order_item would be orphaned.
    const updated = await request("PUT", `/api/v1/products/${created.json().product.id}`, {
      product: {
        option_types: [{ name: "Talla", values: ["38", "39", "40"] }],
        variants: [
          { options: { Talla: "39" }, stock: 3, price: "55.00" },
          { options: { Talla: "38" }, stock: 7 },
          { options: { Talla: "40" }, stock: 1 },
        ],
      },
    });

    assert.equal(updated.statusCode, 200, updated.body);
    const after = updated.json().product.variants;
    assert.equal(after.length, 3);
    assert.equal(
      after.find((variant: { options: { Talla: string } }) => variant.options.Talla === "38").id,
      before.find((variant: { options: { Talla: string } }) => variant.options.Talla === "38").id,
    );
    assert.equal(updated.json().product.total_stock, 11);
  });

  it("borra la escalera con un array vacío y la deja intacta si falta la clave", async () => {
    const created = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Escalonada`,
        price: "10.00",
        price_tiers: [{ min_quantity: 6, unit_price: "9.00" }],
      },
    });
    const id = created.json().product.id;

    const untouched = await request("PUT", `/api/v1/products/${id}`, { product: { active: false } });
    assert.equal(untouched.json().product.price_tiers.length, 1, "clave ausente = no tocar");

    const cleared = await request("PUT", `/api/v1/products/${id}`, {
      product: { price_tiers: [] },
    });
    assert.deepEqual(cleared.json().product.price_tiers, [], "array vacío = borrar todo");
  });

  it("limpia el stock de un servicio", async () => {
    const response = await request("POST", "/api/v1/products", {
      product: { name: `${PREFIX} Asesoría`, price: "30.00", kind: "service", stock: 5 },
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.json().product.stock, null);
    assert.equal(response.json().product.total_stock, null);
  });

  it("filtra por búsqueda y pagina", async () => {
    const response = await request(
      "GET",
      `/api/v1/products?search=${encodeURIComponent(`${PREFIX} Camiseta`)}&per_page=5`,
    );

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.products.length, 1);
    assert.equal(body.pagination.per_page, 5);
    assert.equal(body.pagination.current_page, 1);
  });

  it("responde 404 con mensaje en español", async () => {
    const response = await request("GET", "/api/v1/products/99999999");
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().message, "Producto no encontrado");
  });
});

describe("combos", () => {
  let comboProducts: number[] = [];

  before(async () => {
    const first = await request("POST", "/api/v1/products", {
      product: { name: `${PREFIX} Sérum`, price: "12.00", stock: 10 },
    });
    const second = await request("POST", "/api/v1/products", {
      product: { name: `${PREFIX} Crema`, price: "8.00", stock: 6 },
    });
    comboProducts = [first.json().product.id, second.json().product.id];
  });

  it("crea un combo y calcula ahorro, descuento y unidades disponibles", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Dúo`,
        price: "20.00",
        items: [
          { product_id: comboProducts[0], quantity: 1 },
          { product_id: comboProducts[1], quantity: 2 },
        ],
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    const { promotion } = response.json();
    assert.equal(promotion.regular_total, "28.00"); // 12 + 8*2
    assert.equal(promotion.savings, "8.00");
    assert.equal(promotion.discount_percent, 29);
    assert.equal(promotion.available_units, 3); // min(10/1, 6/2)
    assert.equal(promotion.contents_label, `${PREFIX} Sérum x1 · ${PREFIX} Crema x2`);
    assert.equal(promotion.live, true);
  });

  it("rechaza un combo de un solo producto", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Solo`,
        price: "5.00",
        items: [{ product_id: comboProducts[0], quantity: 1 }],
      },
    });

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.json().errors, ["Un combo necesita al menos 2 productos"]);
  });

  it("rechaza un precio mayor a la suma de sus productos", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Caro`,
        price: "999.00",
        items: [
          { product_id: comboProducts[0], quantity: 1 },
          { product_id: comboProducts[1], quantity: 1 },
        ],
      },
    });

    assert.equal(response.statusCode, 422);
    assert.ok(
      response.json().errors.includes("El precio del combo no puede ser mayor a la suma de sus productos"),
    );
  });

  it("rechaza un producto con variantes", async () => {
    const withVariants = await request("POST", "/api/v1/products", {
      product: {
        name: `${PREFIX} Gorra`,
        price: "9.00",
        option_types: [{ name: "Color", values: ["Negro"] }],
        variants: [{ options: { Color: "Negro" }, stock: 4 }],
      },
    });

    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Con Variantes`,
        price: "15.00",
        items: [
          { product_id: withVariants.json().product.id, quantity: 1 },
          { product_id: comboProducts[1], quantity: 1 },
        ],
      },
    });

    assert.equal(response.statusCode, 422);
    assert.ok(
      response
        .json()
        .errors.some((error: string) => error.includes("tiene variantes y no puede formar parte de un combo")),
    );
  });

  it("fusiona dos filas del mismo producto quedándose con la última", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Repetido`,
        price: "10.00",
        items: [
          { product_id: comboProducts[0], quantity: 1 },
          { product_id: comboProducts[1], quantity: 1 },
          { product_id: comboProducts[0], quantity: 3 },
        ],
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    const { items } = response.json().promotion;
    assert.equal(items.length, 2);
    assert.equal(items.find((item: { product_id: number }) => item.product_id === comboProducts[0]).quantity, 3);
  });

  it("marca como no vigente un combo cuya ventana ya cerró", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Vencido`,
        price: "18.00",
        starts_at: "2020-01-01T00:00:00Z",
        ends_at: "2020-02-01T00:00:00Z",
        items: [
          { product_id: comboProducts[0], quantity: 1 },
          { product_id: comboProducts[1], quantity: 1 },
        ],
      },
    });

    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().promotion.live, false);
    assert.equal(response.json().promotion.sellable, false);
  });

  it("rechaza una ventana invertida", async () => {
    const response = await request("POST", "/api/v1/promotions", {
      promotion: {
        name: `${PREFIX} Invertido`,
        price: "18.00",
        starts_at: "2026-02-01T00:00:00Z",
        ends_at: "2026-01-01T00:00:00Z",
        items: [
          { product_id: comboProducts[0], quantity: 1 },
          { product_id: comboProducts[1], quantity: 1 },
        ],
      },
    });

    assert.equal(response.statusCode, 422);
    assert.ok(
      response.json().errors.includes("La fecha de fin debe ser posterior a la fecha de inicio"),
    );
  });
});
