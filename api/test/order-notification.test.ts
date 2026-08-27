import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, like } from "drizzle-orm";
import { closeDatabase, db } from "../src/db/client.ts";
import { businesses, orderItems, orders, products } from "../src/db/schema.ts";
import { getBusiness } from "../src/services/business.ts";
import { handleOrderNotification } from "../src/jobs/handlers.ts";
import { createOrder } from "../src/services/order-creator.ts";

/**
 * The order notification emails (phase 8).
 *
 * The handler is called directly rather than through pg-boss — enqueueing is a
 * no-op under NODE_ENV=test — and delivery is asserted against the Mailpit
 * container the dev stack already runs. When Mailpit is unreachable the
 * delivery assertions are skipped rather than failing the suite: the handler's
 * decisions (send / skip / unknown event) are the part worth pinning, and they
 * are asserted either way.
 */

const PREFIX = "Test Aviso";
const PHONE = "0977665544";
const MAILPIT = "http://localhost:8025";
const NOTIFY_TO = "avisos-test@example.com";

let orderId = 0;
let businessId = 0;
let originalEmail: string | null = null;
let mailpitUp = false;

type MailpitMessage = { ID: string; Subject: string; To: Array<{ Address: string }> };

async function mailpitReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=1`, {
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function clearMailpit(): Promise<void> {
  if (!mailpitUp) return;
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

async function latestMessage(): Promise<MailpitMessage | null> {
  if (!mailpitUp) return null;
  // The handler awaits sendMail, so the message is already accepted by the
  // time this runs; no polling needed.
  const response = await fetch(`${MAILPIT}/api/v1/messages?limit=5`);
  const body = (await response.json()) as { messages: MailpitMessage[] };
  return body.messages[0] ?? null;
}

async function messageBody(id: string): Promise<{ html: string; text: string }> {
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  const body = (await response.json()) as { HTML: string; Text: string };
  return { html: body.HTML, text: body.Text };
}

before(async () => {
  mailpitUp = await mailpitReachable();
  if (!mailpitUp) {
    console.log("  (Mailpit no responde en :8025 — se omiten las aserciones de entrega)");
  }

  const business = await getBusiness();
  businessId = business.id;
  originalEmail = business.notificationEmail;
  await db
    .update(businesses)
    .set({ notificationEmail: NOTIFY_TO, name: "Tienda de Prueba" })
    .where(eq(businesses.id, businessId));

  const [ladder] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "demo-camiseta"))
    .limit(1);
  assert.ok(ladder, "falta el catálogo demo — corre npm run db:seed:dev");

  const result = await createOrder({
    customer: {
      customer_name: `${PREFIX} Comprador`,
      phone: PHONE,
      address: "Av. Amazonas 100",
      city: "Quito",
      notes: "Dejar en portería",
      payment_method: "transferencia",
      delivery_method: "domicilio",
    },
    items: [{ product_id: ladder.id, quantity: 2 }],
  });
  assert.equal(result.success, true, result.errors.join(", "));
  orderId = result.orderId!;
});

after(async () => {
  await db.delete(orders).where(like(orders.customerName, `${PREFIX}%`));
  await db.update(businesses).set({ notificationEmail: originalEmail }).where(eq(businesses.id, businessId));
  const [ladder] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, "demo-camiseta"))
    .limit(1);
  if (ladder) await db.update(products).set({ stock: 100 }).where(eq(products.id, ladder.id));
  await closeDatabase();
});

beforeEach(clearMailpit);

describe("aviso de pedido nuevo", () => {
  it("se envía al correo de la tienda", async () => {
    assert.equal(await handleOrderNotification({ orderId, event: "new_order" }), true);
    if (!mailpitUp) return;

    const message = await latestMessage();
    assert.ok(message, "no llegó ningún correo");
    assert.equal(message.To[0]?.Address, NOTIFY_TO);
    assert.match(message.Subject, /^Nuevo pedido RY-\d{5} por \$20\.00$/);
  });

  it("lleva el cliente, las líneas y el total en HTML y en texto plano", async () => {
    await handleOrderNotification({ orderId, event: "new_order" });
    if (!mailpitUp) return;

    const message = await latestMessage();
    const { html, text } = await messageBody(message!.ID);

    for (const body of [html, text]) {
      assert.ok(body.includes(`${PREFIX} Comprador`), "falta el nombre del cliente");
      assert.ok(body.includes(PHONE), "falta el teléfono");
      assert.ok(body.includes("Av. Amazonas 100, Quito"), "falta la dirección con la ciudad");
      assert.ok(body.includes("Dejar en portería"), "faltan las notas");
      assert.ok(body.includes("Demo Camiseta"), "falta la línea del pedido");
      assert.ok(body.includes("20.00"), "falta el total");
      assert.ok(
        body.includes("comprobante"),
        "una transferencia avisa que falta el comprobante",
      );
    }
    assert.ok(html.includes('href="tel:'), "el teléfono es marcable desde el correo");
  });
});

describe("aviso de comprobante", () => {
  it("se envía con el estado actual del pedido", async () => {
    assert.equal(await handleOrderNotification({ orderId, event: "payment_proof" }), true);
    if (!mailpitUp) return;

    const message = await latestMessage();
    assert.match(message!.Subject, /^Comprobante recibido — pedido RY-\d{5}$/);

    const { html, text } = await messageBody(message!.ID);
    for (const body of [html, text]) {
      assert.ok(body.includes("pendiente"), "el estado se lee al enviar, no al encolar");
    }
    assert.ok(!html.includes("payment_proof_key"), "el comprobante no se enlaza: las URLs caducan");
  });
});

describe("casos que no son fallos", () => {
  it("un pedido borrado no envía nada y no reintenta", async () => {
    assert.equal(await handleOrderNotification({ orderId: 99_999_999, event: "new_order" }), false);
    if (mailpitUp) assert.equal(await latestMessage(), null);
  });

  it("sin notification_email no se envía: es una baja deliberada", async () => {
    await db.update(businesses).set({ notificationEmail: "" }).where(eq(businesses.id, businessId));
    try {
      assert.equal(await handleOrderNotification({ orderId, event: "new_order" }), false);
      if (mailpitUp) assert.equal(await latestMessage(), null);
    } finally {
      await db
        .update(businesses)
        .set({ notificationEmail: NOTIFY_TO })
        .where(eq(businesses.id, businessId));
    }
  });

  it("un evento desconocido se registra sin enviar", async () => {
    const unknown = { orderId, event: "reembolso" } as unknown as Parameters<
      typeof handleOrderNotification
    >[0];
    assert.equal(await handleOrderNotification(unknown), false);
    if (mailpitUp) assert.equal(await latestMessage(), null);
  });
});

describe("el comprador nunca recibe correo", () => {
  it("solo hay un destinatario y es la tienda", async () => {
    await handleOrderNotification({ orderId, event: "new_order" });
    if (!mailpitUp) return;

    const response = await fetch(`${MAILPIT}/api/v1/messages?limit=20`);
    const { messages } = (await response.json()) as { messages: MailpitMessage[] };
    for (const message of messages) {
      assert.deepEqual(
        message.To.map((recipient) => recipient.Address),
        [NOTIFY_TO],
        "el comprador no tiene cuenta ni correo: su canal es WhatsApp",
      );
    }
  });
});

// Keeps the unused import warning honest — order_items is what the new_order
// email renders, and an order with no lines would silently pass above.
describe("integridad de la muestra", () => {
  it("el pedido de prueba tiene líneas", async () => {
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.unitPrice, "10.00");
  });
});
