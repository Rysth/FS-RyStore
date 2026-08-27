import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.ts";
import {
  coupons,
  orderItems,
  orders,
  products,
  productVariants,
  promotions,
} from "../src/db/schema.ts";
import { createOrder, normalizeItems, previewSubtotal, tierQuantities } from "../src/services/order-creator.ts";
import { fromCents } from "../src/lib/money.ts";

/**
 * The behaviour contract of order_creator.rb. Every case here is one the Rails
 * suite covered and one where getting it wrong costs the shop real money.
 *
 * Depends on the catalog from `npm run db:seed:dev`.
 */

const CUSTOMER = {
  customer_name: "Comprador Prueba",
  phone: "0999123456",
  address: "Av. Siempre Viva 742",
  city: "Quito",
  payment_method: "efectivo",
  delivery_method: "domicilio",
};

const created: number[] = [];

let ladderId = 0;
let variantProductId = 0;
let serviceId = 0;
let untrackedId = 0;
let comboId = 0;
let variant38 = 0;
let variant39 = 0;

async function idBySlug(slug: string): Promise<number> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  assert.ok(row, `falta el producto ${slug} — corre npm run db:seed:dev`);
  return row.id;
}

async function place(overrides: Parameters<typeof createOrder>[0]) {
  const result = await createOrder(overrides);
  if (result.success) created.push(result.orderId);
  return result;
}

async function itemsOf(orderId: number) {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.id);
}

async function stockOf(productId: number): Promise<number | null> {
  const [row] = await db.select({ stock: products.stock }).from(products).where(eq(products.id, productId));
  return row?.stock ?? null;
}

before(async () => {
  ladderId = await idBySlug("demo-camiseta");
  variantProductId = await idBySlug("demo-zapato");
  serviceId = await idBySlug("demo-asesoria");
  untrackedId = await idBySlug("demo-sticker");

  const [combo] = await db.select().from(promotions).where(eq(promotions.slug, "demo-combo-basico"));
  comboId = combo!.id;

  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, variantProductId))
    .orderBy(productVariants.position);
  variant38 = variants[0]!.id;
  variant39 = variants[1]!.id;

  // Reset the mutable stock the tests draw down.
  await db.update(products).set({ stock: 100 }).where(eq(products.id, ladderId));
  await db.update(productVariants).set({ stock: 5 }).where(eq(productVariants.productId, variantProductId));
  await db.update(coupons).set({ usageCount: 0 }).where(eq(coupons.code, "DEMO10"));
});

after(async () => {
  if (created.length > 0) {
    await db.delete(orderItems).where(inArray(orderItems.orderId, created));
    await db.delete(orders).where(inArray(orders.id, created));
  }
  await closeDatabase();
});

describe("normalización del carrito", () => {
  it("fusiona líneas duplicadas del mismo producto y variante", () => {
    const lines = normalizeItems([
      { product_id: 1, quantity: 3 },
      { product_id: 1, quantity: 3 },
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.quantity, 6);
  });

  it("mantiene separadas dos variantes del mismo producto", () => {
    const lines = normalizeItems([
      { product_id: 1, variant_id: 10, quantity: 5 },
      { product_id: 1, variant_id: 11, quantity: 5 },
    ]);
    assert.equal(lines.length, 2);
    // …pero la escalera las suma.
    assert.equal(tierQuantities(lines).get(1), 10);
  });

  it("descarta cantidades no positivas y líneas de combo", () => {
    const lines = normalizeItems([
      { product_id: 1, quantity: 0 },
      { product_id: 2, quantity: -4 },
      { promotion_id: 9, quantity: 2 },
    ]);
    assert.deepEqual(lines, []);
  });
});

describe("precios", () => {
  it("ignora el precio que mande el cliente y usa el de la base", async () => {
    const result = await place({
      customer: CUSTOMER,
      // @ts-expect-error: un cliente malicioso manda campos de más.
      items: [{ product_id: ladderId, quantity: 1, unit_price: "0.01", price: "0.01" }],
    });
    assert.ok(result.success, result.errors.join(", "));

    const [item] = await itemsOf(result.orderId);
    assert.equal(item!.unitPrice, "10.00");
    assert.equal(item!.subtotal, "10.00");
  });

  it("aplica el precio de lista por debajo del primer tramo", async () => {
    const result = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 5 }] });
    assert.ok(result.success);
    const [item] = await itemsOf(result.orderId);
    assert.equal(item!.unitPrice, "10.00");
    assert.equal(item!.subtotal, "50.00");
  });

  it("aplica el tramo mayorista al calificar", async () => {
    const result = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 6 }] });
    assert.ok(result.success);
    const [item] = await itemsOf(result.orderId);
    assert.equal(item!.unitPrice, "9.00");
    assert.equal(item!.subtotal, "54.00");
  });

  it("las líneas fusionadas cruzan el umbral juntas", async () => {
    // 3 + 3 en dos añadidos distintos = 6 unidades, que sí califican.
    const result = await place({
      customer: CUSTOMER,
      items: [
        { product_id: ladderId, quantity: 3 },
        { product_id: ladderId, quantity: 3 },
      ],
    });
    assert.ok(result.success);

    const items = await itemsOf(result.orderId);
    assert.equal(items.length, 1, "las dos líneas deben fusionarse en una");
    assert.equal(items[0]!.quantity, 6);
    assert.equal(items[0]!.unitPrice, "9.00");
  });

  it("la escalera suma las variantes del mismo producto", async () => {
    // 3 de la talla 38 + 3 de la 39. La 39 tiene precio propio, así que solo
    // la 38 hereda la escalera del producto (que aquí no tiene tramos).
    const result = await place({
      customer: CUSTOMER,
      items: [
        { product_id: variantProductId, variant_id: variant38, quantity: 3 },
        { product_id: variantProductId, variant_id: variant39, quantity: 3 },
      ],
    });
    assert.ok(result.success, result.errors.join(", "));

    const items = await itemsOf(result.orderId);
    assert.equal(items.length, 2);
    assert.equal(items.find((i) => i.productVariantId === variant38)!.unitPrice, "50.00");
    assert.equal(items.find((i) => i.productVariantId === variant39)!.unitPrice, "55.00");
  });

  it("congela la etiqueta de la variante en la línea", async () => {
    const result = await place({
      customer: CUSTOMER,
      items: [{ product_id: variantProductId, variant_id: variant38, quantity: 1 }],
    });
    assert.ok(result.success);
    const [item] = await itemsOf(result.orderId);
    assert.equal(item!.variantLabel, "Talla: 38 · Color: Negro");
    assert.equal(item!.productName, "Demo Zapato");
  });
});

describe("stock", () => {
  it("decrementa el stock del producto", async () => {
    const before = await stockOf(ladderId);
    const result = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 2 }] });
    assert.ok(result.success);
    assert.equal(await stockOf(ladderId), (before ?? 0) - 2);
  });

  it("no toca un producto sin inventario rastreado", async () => {
    const result = await place({ customer: CUSTOMER, items: [{ product_id: untrackedId, quantity: 999 }] });
    assert.ok(result.success, result.errors.join(", "));
    assert.equal(await stockOf(untrackedId), null);
  });

  it("rechaza cuando no alcanza el stock", async () => {
    const result = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: ladderId, quantity: 100_000 }],
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.some((e) => e.includes("No hay suficiente stock")), result.errors.join(", "));
  });

  it("nombra la combinación cuando falta stock de una variante", async () => {
    const result = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: variantProductId, variant_id: variant38, quantity: 999 }],
    });
    assert.equal(result.success, false);
    assert.ok(result.errors[0]!.includes("Talla: 38"), result.errors.join(", "));
  });

  it("exige elegir variante en un producto que las tiene", async () => {
    const result = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: variantProductId, quantity: 1 }],
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["Elige una opción de Demo Zapato"]);
  });
});

describe("combos", () => {
  it("entra como una sola línea al precio del combo", async () => {
    const result = await place({ customer: CUSTOMER, items: [{ promotion_id: comboId, quantity: 1 }] });
    assert.ok(result.success, result.errors.join(", "));

    const items = await itemsOf(result.orderId);
    assert.equal(items.length, 1);
    assert.equal(items[0]!.unitPrice, "15.00");
    assert.equal(items[0]!.productId, null, "una línea de combo no lleva product_id");
    assert.equal(items[0]!.promotionId, comboId);
    assert.equal(items[0]!.details, "Demo Camiseta x1 · Demo Sticker x2");
  });

  it("descuenta el stock de cada producto interno", async () => {
    const before = await stockOf(ladderId);
    const result = await place({ customer: CUSTOMER, items: [{ promotion_id: comboId, quantity: 2 }] });
    assert.ok(result.success);
    // El combo lleva 1 camiseta por unidad, así que 2 combos son 2 camisetas.
    assert.equal(await stockOf(ladderId), (before ?? 0) - 2);
  });

  it("valida el stock contra el carrito completo, combo y línea suelta juntos", async () => {
    await db.update(products).set({ stock: 3 }).where(eq(products.id, ladderId));

    const result = await createOrder({
      customer: CUSTOMER,
      items: [
        { product_id: ladderId, quantity: 3 },
        { promotion_id: comboId, quantity: 1 },
      ],
    });

    assert.equal(result.success, false, "3 sueltas + 1 del combo son 4 y solo hay 3");
    await db.update(products).set({ stock: 100 }).where(eq(products.id, ladderId));
  });

  it("el combo no empuja el producto suelto a un tramo más barato", async () => {
    // 5 sueltas (por debajo del tramo de 6) + un combo que lleva 1 más.
    const result = await place({
      customer: CUSTOMER,
      items: [
        { product_id: ladderId, quantity: 5 },
        { promotion_id: comboId, quantity: 1 },
      ],
    });
    assert.ok(result.success, result.errors.join(", "));

    const items = await itemsOf(result.orderId);
    const loose = items.find((item) => item.productId === ladderId);
    assert.equal(loose!.unitPrice, "10.00", "el combo no debe contar para la escalera");
  });
});

describe("cupones", () => {
  it("descuenta un porcentaje y sube usage_count", async () => {
    const result = await place({
      customer: CUSTOMER,
      items: [{ product_id: ladderId, quantity: 1 }],
      couponCode: "demo10",
    });
    assert.ok(result.success, result.errors.join(", "));

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
    assert.equal(order!.subtotal, "10.00");
    assert.equal(order!.discountAmount, "1.00");
    assert.equal(order!.total, "9.00");

    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, "DEMO10"));
    assert.equal(coupon!.usageCount, 1);
  });

  it("no persiste nada si el cupón no sirve", async () => {
    const stockBefore = await stockOf(ladderId);
    const result = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: ladderId, quantity: 1 }],
      couponCode: "DEMOAGOTADO",
    });

    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["El cupón no es válido, expiró o alcanzó su límite de uso"]);
    assert.equal(await stockOf(ladderId), stockBefore, "el stock no debe moverse");
  });

  it("rechaza un cupón inexistente", async () => {
    const result = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: ladderId, quantity: 1 }],
      couponCode: "NOEXISTE",
    });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["El cupón no existe"]);
  });
});

describe("cliente y reglas de checkout", () => {
  it("vincula el pedido a un Customer por teléfono, ignorando separadores", async () => {
    // El teléfono se normaliza a solo dígitos, así que estas dos formas son la
    // misma persona. Un prefijo distinto (+593…) sería otro cliente, igual que
    // en Rails: la normalización quita separadores, no reescribe el país.
    const first = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 1 }] });
    const second = await place({
      customer: { ...CUSTOMER, phone: "099-912 3456" },
      items: [{ product_id: ladderId, quantity: 1 }],
    });
    assert.ok(first.success && second.success);

    const customerIdOf = async (orderId: number) => {
      const [row] = await db
        .select({ customerId: orders.customerId })
        .from(orders)
        .where(eq(orders.id, orderId));
      return row!.customerId;
    };

    const firstCustomer = await customerIdOf(first.orderId);
    assert.ok(firstCustomer);
    assert.equal(await customerIdOf(second.orderId), firstCustomer);
  });

  it("un prefijo internacional distinto es otro cliente", async () => {
    const local = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 1 }] });
    const international = await place({
      customer: { ...CUSTOMER, phone: "+593 99 912 3456" },
      items: [{ product_id: ladderId, quantity: 1 }],
    });
    assert.ok(local.success && international.success);

    const [a] = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, local.orderId));
    const [b] = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, international.orderId));
    assert.notEqual(a!.customerId, b!.customerId);
  });

  it("asigna número RY- y un token público distinto del número", async () => {
    const result = await place({ customer: CUSTOMER, items: [{ product_id: ladderId, quantity: 1 }] });
    assert.ok(result.success);

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
    assert.match(order!.number!, /^RY-\d{5,}$/);
    assert.ok(order!.publicToken.length >= 30);
    assert.notEqual(order!.publicToken, order!.number);
  });

  it("un carrito vacío no crea nada", async () => {
    const result = await createOrder({ customer: CUSTOMER, items: [] });
    assert.equal(result.success, false);
    assert.deepEqual(result.errors, ["El carrito está vacío"]);
  });

  it("exige dirección para envío a domicilio", async () => {
    const result = await createOrder({
      customer: { ...CUSTOMER, address: "" },
      items: [{ product_id: ladderId, quantity: 1 }],
    });
    assert.equal(result.success, false);
    assert.ok(result.errors.includes("La dirección es requerida para envíos a domicilio"));
  });

  it("un carrito solo de servicios exige transferencia y retiro", async () => {
    const rejected = await createOrder({
      customer: CUSTOMER,
      items: [{ product_id: serviceId, quantity: 1 }],
    });
    assert.equal(rejected.success, false);
    assert.ok(rejected.errors.includes("Los servicios solo aceptan pago por transferencia bancaria"));
    assert.ok(rejected.errors.includes("Los servicios no requieren dirección de entrega"));

    const accepted = await place({
      customer: { ...CUSTOMER, payment_method: "transferencia", delivery_method: "retiro" },
      items: [{ product_id: serviceId, quantity: 1 }],
    });
    assert.ok(accepted.success, accepted.errors.join(", "));
  });

  it("un servicio mezclado con producto físico no dispara la regla", async () => {
    const result = await place({
      customer: CUSTOMER,
      items: [
        { product_id: serviceId, quantity: 1 },
        { product_id: ladderId, quantity: 1 },
      ],
    });
    assert.ok(result.success, result.errors.join(", "));
  });
});

describe("previewSubtotal", () => {
  it("cotiza igual que el checkout, incluida la escalera", async () => {
    const subtotal = await previewSubtotal([
      { product_id: ladderId, quantity: 3 },
      { product_id: ladderId, quantity: 3 },
    ]);
    assert.equal(fromCents(subtotal), "54.00");
  });

  it("ignora los combos", async () => {
    const subtotal = await previewSubtotal([{ promotion_id: comboId, quantity: 1 }]);
    assert.equal(fromCents(subtotal), "0.00");
  });
});
