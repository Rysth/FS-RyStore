import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { orderItems, orders, coupons } from "../db/schema.ts";
import type { Order } from "../db/schema.ts";
import {
  DELIVERY_METHOD_LABELS,
  PAYMENT_METHOD_LABELS,
} from "../db/schema.ts";
import type { DeliveryMethod, PaymentMethod } from "../db/schema.ts";
import { fail, ok } from "../lib/response.ts";
import { fromCents } from "../lib/money.ts";
import { assetUrl, serializeBusiness } from "../lib/serializers.ts";
import { paginationInput, parseOrFail } from "../lib/validation.ts";
import { fileNamed, readMultipart, unwrap } from "../lib/multipart.ts";
import { PAYMENT_PROOF_CONTENT_TYPES } from "../lib/images.ts";
import {
  deleteObjectQuietly,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadAsset,
} from "../lib/storage.ts";
import { enqueueOrderNotification } from "../jobs/queue.ts";
import { RATE_LIMITS } from "../middleware/rate-limit.ts";
import { enforceStorePublished } from "../middleware/store-published.ts";
import { getBusiness } from "../services/business.ts";
import { applyCoupon } from "../services/coupon-applier.ts";
import { cancelOrder } from "../services/order-canceller.ts";
import { createOrder, previewSubtotal } from "../services/order-creator.ts";
import {
  EMPTY_PAGINATION,
  publicCategories,
  publicProductBySlug,
  publicProductJson,
  publicProducts,
  publicPromotions,
  relatedProducts,
  serializeStore,
} from "../services/storefront.ts";
import { buildWhatsappMessage } from "../services/whatsapp-message.ts";

/**
 * The storefront API. Ported from Api::V1::Public::*.
 *
 * Everything here is unauthenticated by design — the buyer has no account.
 * Three things stand in for a session:
 *
 * - `enforceStorePublished` closes the catalog when the shop unpublishes it.
 *   Enforcing it here rather than in the storefront matters: a storefront-only
 *   check would leave the whole catalog readable straight from the API while
 *   the shop believes it is offline, and crawlers would keep indexing it.
 * - `orders.public_token` authorises the confirmation page and the receipt
 *   upload. The order `number` never does — it is sequential and guessable.
 * - A tighter rate limit on checkout.
 */

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const catalogQuerySchema = paginationInput.extend({
  category: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  min_price: z.string().trim().optional(),
  max_price: z.string().trim().optional(),
  sort: z.string().trim().optional(),
});

const checkoutSchema = z.object({
  customer_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
  payment_method: z.string().optional(),
  delivery_method: z.string().optional(),
  // Honeypot: a real buyer never sees this field, so anything in it is a bot.
  checkout_fax_confirmation: z.string().nullish(),
});

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  // The storefront's CORS policy is declared in server.ts, as a delegator on
  // the single cors registration — the plugin cannot be registered twice.
  registerOpenRoutes(app);
  registerGatedRoutes(app);
  registerOrderRoutes(app);
  await Promise.resolve();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Exempt from the published gate
 * ──────────────────────────────────────────────────────────────────────────── */

function registerOpenRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/public/store — what the storefront renders its shell from.
   *
   * Exempt from the published gate on purpose: this payload is what the
   * "volvemos pronto" page reads, so gating it would leave a closed shop
   * showing a generic error instead of its own name and a way to be contacted.
   */
  app.get("/api/v1/public/store", async (_request, reply) => {
    return ok(reply, { store: serializeStore(await getBusiness()) });
  });

  // Legacy shape kept for the storefront's older calls.
  app.get("/api/v1/public/business", async (_request, reply) => {
    const {
      created_at: _created,
      updated_at: _updated,
      notification_email: _email,
      ...publicFields
    } = serializeBusiness(await getBusiness());
    return ok(reply, { business: publicFields });
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Catalog — closed when the shop unpublishes
 * ──────────────────────────────────────────────────────────────────────────── */

function registerGatedRoutes(app: FastifyInstance): void {
  const gate = { preHandler: enforceStorePublished };

  app.get("/api/v1/public/categories", gate, async (_request, reply) => {
    return ok(reply, { categories: await publicCategories() });
  });

  app.get("/api/v1/public/promotions", gate, async (_request, reply) => {
    return ok(reply, { promotions: await publicPromotions() });
  });

  app.get("/api/v1/public/products", gate, async (request, reply) => {
    const query = parseOrFail(catalogQuerySchema, request.query, reply);
    if (!query) return reply;

    const result = await publicProducts(
      {
        ...(query.category ? { categorySlug: query.category } : {}),
        ...(query.search ? { search: query.search } : {}),
        ...(query.min_price ? { minPrice: query.min_price } : {}),
        ...(query.max_price ? { maxPrice: query.max_price } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      },
      query.page,
      query.per_page,
    );

    if (result === null) {
      return ok(reply, { products: [], pagination: { ...EMPTY_PAGINATION } });
    }

    return ok(reply, {
      products: result.rows.map(publicProductJson),
      pagination: {
        current_page: query.page,
        total_pages: Math.max(1, Math.ceil(result.total / query.per_page)),
        total_count: result.total,
        per_page: query.per_page,
      },
    });
  });

  app.get("/api/v1/public/products/:slug", gate, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const record = await publicProductBySlug(slug);
    if (!record) return fail(reply, "Producto no encontrado", 404, { error: "not_found" });

    return ok(reply, {
      product: publicProductJson(record),
      related: (await relatedProducts(record)).map(publicProductJson),
    });
  });

  /**
   * POST /api/v1/public/coupons/validate — the "aplicar cupón" preview.
   *
   * Recomputes the subtotal the same way checkout will and validates the code
   * through the same applier, so what this shows never disagrees with what
   * checkout charges. Persists nothing and never touches usage_count.
   */
  app.post("/api/v1/public/coupons/validate", gate, async (request, reply) => {
    const body = (request.body ?? {}) as { items?: unknown; code?: unknown };
    const subtotal = await previewSubtotal(Array.isArray(body.items) ? body.items : []);
    const result = await applyCoupon({
      code: typeof body.code === "string" ? body.code : "",
      subtotal,
    });

    if (result.error) return fail(reply, result.error, 422);
    // An empty code is valid but nameless — there is no coupon to echo back.
    if (!result.coupon) return fail(reply, "El cupón no existe", 422);

    return ok(reply, {
      coupon: {
        code: result.coupon.code,
        discount_type: result.coupon.discountType,
        discount_value: result.coupon.discountValue,
      },
      subtotal: fromCents(subtotal),
      discount_amount: fromCents(result.discountAmount),
      total: fromCents(subtotal - result.discountAmount),
    });
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Checkout and the buyer's own order
 * ──────────────────────────────────────────────────────────────────────────── */

function registerOrderRoutes(app: FastifyInstance): void {
  /**
   * POST /api/v1/public/orders — guest checkout.
   *
   * The order is persisted BEFORE the WhatsApp link is handed back, so a buyer
   * who never sends the message still leaves a record for the shop. That is
   * this product's whole advantage over link-only catalogs — do not move
   * persistence behind the WhatsApp step.
   */
  app.post(
    "/api/v1/public/orders",
    { preHandler: enforceStorePublished, config: { rateLimit: RATE_LIMITS.publicOrders } },
    async (request, reply) => {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const values = parseOrFail(checkoutSchema, unwrap(body, "order"), reply);
      if (!values) return reply;

      // A filled honeypot gets the same generic message a real failure does:
      // telling a bot which field gave it away is free tuning.
      if (values.checkout_fax_confirmation?.trim()) {
        return fail(reply, "No se pudo registrar el pedido", 422);
      }

      const result = await createOrder({
        customer: {
          customer_name: values.customer_name ?? "",
          phone: values.phone ?? "",
          address: values.address ?? null,
          city: values.city ?? null,
          notes: values.notes ?? null,
          payment_method: values.payment_method ?? "",
          delivery_method: values.delivery_method ?? "",
        },
        items: Array.isArray(body.items) ? body.items : [],
        couponCode: typeof body.coupon_code === "string" ? body.coupon_code : null,
      });

      if (!result.success) {
        return fail(reply, "No se pudo registrar el pedido", 422, { errors: result.errors });
      }

      const detail = await loadByToken(null, result.orderId);
      if (!detail) return fail(reply, "No se pudo registrar el pedido", 422);

      // Enqueued here rather than from inside the creator: that saves in a
      // transaction, so notifying there would fire before commit.
      await enqueueNotification(request, result.orderId, "new_order");

      const business = await getBusiness();
      const { text, url } = buildWhatsappMessage(
        { ...detail.order, couponCode: detail.couponCode },
        detail.items,
        business,
      );

      return ok(
        reply,
        {
          order: {
            id: detail.order.id,
            number: detail.order.number,
            subtotal: detail.order.subtotal,
            discount_amount: detail.order.discountAmount,
            coupon_code: detail.couponCode,
            total: detail.order.total,
            status: detail.order.status,
            // The buyer has no account, so this secret is the only key to their
            // confirmation page. Never expose it in the admin JSON.
            token: detail.order.publicToken,
            payment_method: detail.order.paymentMethod,
            payment_proof_required: proofRequired(detail.order),
          },
          whatsapp_message: text,
          whatsapp_url: url,
        },
        { message: "¡Pedido registrado correctamente!", statusCode: 201 },
      );
    },
  );

  /**
   * The three routes below stay open while the shop is unpublished. Their buyer
   * paid, or is about to: taking their confirmation page and their receipt
   * upload away because the shop is reworking the catalog would punish them for
   * the shop's timing. Creating *new* orders stays gated.
   */

  app.get("/api/v1/public/orders/:token", async (request, reply) => {
    const detail = await loadByToken((request.params as { token: string }).token);
    if (!detail) return fail(reply, "Pedido no encontrado", 404, { error: "not_found" });

    const business = await getBusiness();
    const { text, url } = buildWhatsappMessage(
      { ...detail.order, couponCode: detail.couponCode },
      detail.items,
      business,
    );

    return ok(reply, {
      order: serializePublicOrder(detail),
      whatsapp_message: text,
      whatsapp_url: url,
    });
  });

  app.post("/api/v1/public/orders/:token/cancel", async (request, reply) => {
    const detail = await loadByToken((request.params as { token: string }).token);
    if (!detail) return fail(reply, "Pedido no encontrado", 404, { error: "not_found" });

    const message = "Este pedido ya no se puede cancelar desde la tienda";
    // Cash orders and orders with a receipt already uploaded are a conversation
    // with the shop, not a button the buyer presses.
    if (detail.order.paymentMethod !== "transferencia" || detail.order.paymentProofKey) {
      return fail(reply, message, 422);
    }
    if (!(await cancelOrder(detail.order.id))) return fail(reply, message, 422);

    const reloaded = await loadByToken(null, detail.order.id);
    return ok(reply, { order: serializePublicOrder(reloaded!) }, {
      message: "Pedido cancelado correctamente",
    });
  });

  app.post("/api/v1/public/orders/:token/payment_proof", async (request, reply) => {
    const detail = await loadByToken((request.params as { token: string }).token);
    if (!detail) return fail(reply, "Pedido no encontrado", 404, { error: "not_found" });

    if (detail.order.status === "cancelado") {
      return fail(reply, "Este pedido está cancelado", 422);
    }

    const { files } = await readMultipart(request);
    const proof = fileNamed(files, "payment_proof");
    if (!proof) {
      const message = "Debes adjuntar el comprobante";
      return fail(reply, message, 422, { errors: [message] });
    }

    if (!isStorageConfigured()) {
      return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    }
    if (proof.buffer.byteLength > MAX_PROOF_BYTES) {
      const message = "El comprobante debe pesar menos de 5MB";
      return fail(reply, message, 422, { errors: [message] });
    }
    if (!PAYMENT_PROOF_CONTENT_TYPES.includes(proof.contentType)) {
      const message = "El comprobante debe ser JPG, PNG, WEBP o PDF";
      return fail(reply, message, 422, { errors: [message] });
    }

    let key: string;
    try {
      // Receipts are stored as sent: re-encoding a bank screenshot to WebP can
      // cost the shop the digits it needs to read.
      key = await uploadAsset(proof, {
        folder: `orders/${detail.order.id}`,
        prefix: "comprobante",
      });
    } catch (error) {
      request.log.error({ err: error }, "fallo al subir el comprobante");
      return fail(reply, "No se pudo guardar el comprobante. Inténtalo de nuevo.", 502, {
        error: "storage_unavailable",
      });
    }

    await db
      .update(orders)
      .set({ paymentProofKey: key, updatedAt: new Date() })
      .where(eq(orders.id, detail.order.id));
    await deleteObjectQuietly(detail.order.paymentProofKey);

    await enqueueNotification(request, detail.order.id, "payment_proof");

    return ok(reply, { payment_proof_url: assetUrl(key) }, { message: "¡Comprobante recibido!" });
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

type PublicOrderDetail = {
  order: Order;
  couponCode: string | null;
  items: Array<typeof orderItems.$inferSelect>;
};

/** Looks an order up by its token, or by id right after creating it. */
async function loadByToken(token: string | null, id?: number): Promise<PublicOrderDetail | null> {
  const [row] = await db
    .select({ order: orders, couponCode: coupons.code })
    .from(orders)
    .leftJoin(coupons, eq(orders.couponId, coupons.id))
    .where(id !== undefined ? eq(orders.id, id) : eq(orders.publicToken, token ?? ""))
    .limit(1);
  if (!row) return null;

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, row.order.id));
  return { order: row.order, couponCode: row.couponCode, items };
}

function proofRequired(order: Order): boolean {
  return order.paymentMethod === "transferencia";
}

function serializePublicOrder(detail: PublicOrderDetail) {
  const { order } = detail;
  return {
    // `number` is what the buyer quotes to the shop; `public_token` stays in
    // the URL and is never repeated in the body.
    number: order.number,
    status: order.status,
    subtotal: order.subtotal,
    discount_amount: order.discountAmount,
    coupon_code: detail.couponCode,
    total: order.total,
    customer_name: order.customerName,
    phone: order.phone,
    address: order.address,
    city: order.city,
    notes: order.notes,
    payment_method: order.paymentMethod,
    payment_method_label:
      PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod,
    delivery_method: order.deliveryMethod,
    delivery_method_label:
      DELIVERY_METHOD_LABELS[order.deliveryMethod as DeliveryMethod] ?? order.deliveryMethod,
    payment_proof_required: proofRequired(order),
    payment_proof_url: assetUrl(order.paymentProofKey),
    created_at: order.createdAt,
    items: detail.items.map((item) => ({
      product_name: item.productName,
      variant_label: item.variantLabel,
      // What a combo line contained, frozen at purchase time.
      details: item.details,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      subtotal: item.subtotal,
    })),
  };
}

/**
 * A queue that is down must not cost the shop the sale: the order is already
 * committed, and the shop still gets it over WhatsApp. Logged, not raised.
 */
async function enqueueNotification(
  request: { log: { warn: (obj: unknown, msg: string) => void } },
  orderId: number,
  event: "new_order" | "payment_proof",
): Promise<void> {
  try {
    await enqueueOrderNotification({ orderId, event });
  } catch (error) {
    request.log.warn({ err: error, orderId, event }, "no se pudo encolar la notificación del pedido");
  }
}
