import type { FastifyInstance, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { orders, ORDER_STATUSES } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { paginationInput, parseOrFail } from "../lib/validation.ts";
import { unwrap } from "../lib/multipart.ts";
import { createOrder } from "../services/order-creator.ts";
import { refreshStats } from "../services/customers.ts";
import {
  findOrder,
  listOrders,
  serializeOrder,
  serializeOrderDetail,
  statusSummary,
} from "../services/orders.ts";
import type { OrderRecord } from "../services/orders.ts";

/** Port of Api::V1::OrdersController. */

const listQuerySchema = paginationInput.extend({
  status: z.string().trim().optional(),
  search: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
  customer_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
  payment_method: z.string().optional(),
  delivery_method: z.string().optional(),
  status: z.string().optional(),
});

const statusSchema = z.object({ status: z.string() });

export async function registerOrderRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_ORDERS, PERMISSION_KEYS.MANAGE_ORDERS);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_ORDERS);

  app.get("/api/v1/orders", { preHandler: canRead }, async (request, reply) => {
    const query = parseOrFail(listQuerySchema, request.query, reply);
    if (!query) return reply;

    const { rows, total } = await listOrders(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
      query.page,
      query.per_page,
    );

    return ok(reply, {
      orders: rows.map((row) => serializeOrder(row)),
      summary: await statusSummary(),
      pagination: {
        current_page: query.page,
        total_pages: Math.max(1, Math.ceil(total / query.per_page)),
        total_count: total,
        per_page: query.per_page,
      },
    });
  });

  app.get("/api/v1/orders/:id", { preHandler: canRead }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;
    return ok(reply, { order: await serializeOrderDetail(record) });
  });

  /**
   * An order the shop takes by phone, by WhatsApp or across the counter.
   *
   * Goes through the same order-creator as the storefront checkout, so prices
   * come from the catalog, the wholesale ladder applies, the resolved price is
   * frozen onto the lines and stock is decremented. A hand-typed total would
   * drift from the catalog and break the ladder.
   */
  app.post("/api/v1/orders", { preHandler: canWrite }, async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const values = parseOrFail(createSchema, unwrap(body, "order"), reply);
    if (!values) return reply;

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

    // Deliberately no order-notification job: that email tells the shop an
    // order arrived, and here the shop is the one entering it.
    await applyInitialStatus(result.orderId, values.status);

    const created = (await findOrder(result.orderId))!;
    // The creator counted the order as billable before the status was applied;
    // starting it as "cancelado" has to be reflected in the contact's totals.
    if (created.order.status === "cancelado" && created.order.customerId) {
      await refreshStats(created.order.customerId);
    }

    return ok(reply, { order: await serializeOrderDetail(created) }, {
      message: "Pedido registrado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/orders/:id/update_status",
      preHandler: canWrite,
      async handler(request, reply) {
        const record = await loadOrFail(request.params, reply);
        if (!record) return reply;

        const values = parseOrFail(statusSchema, unwrap(request.body, "order"), reply);
        if (!values) return reply;

        if (!(ORDER_STATUSES as readonly string[]).includes(values.status)) {
          return fail(reply, "El estado del pedido no es válido", 422);
        }
        if (record.order.status === "cancelado" && values.status !== "cancelado") {
          return fail(reply, "Un pedido cancelado no se puede volver a modificar", 422);
        }

        await db
          .update(orders)
          .set({ status: values.status, updatedAt: new Date() })
          .where(eq(orders.id, record.order.id));

        // Cancelling (or reviving) an order changes what counts toward the
        // contact's totals — refreshStats' "not cancelado" rule.
        if (record.order.customerId) await refreshStats(record.order.customerId);

        return ok(reply, { order: await serializeOrderDetail((await findOrder(record.order.id))!) }, {
          message: "Estado del pedido actualizado",
        });
      },
    });
  }

  await Promise.resolve();
}

/**
 * An order the shop takes in person is usually already agreed, so it can start
 * past "pendiente". Applied after creation rather than passed into the creator,
 * which owns the storefront's invariant that a new checkout starts pending.
 */
async function applyInitialStatus(orderId: number, status: string | undefined): Promise<void> {
  if (!status || !(ORDER_STATUSES as readonly string[]).includes(status)) return;
  if (status === "pendiente") return;

  await db.update(orders).set({ status, updatedAt: new Date() }).where(eq(orders.id, orderId));
}

async function loadOrFail(params: unknown, reply: FastifyReply): Promise<OrderRecord | null> {
  const id = Number((params as { id: string }).id);
  const record = Number.isInteger(id) ? await findOrder(id) : null;
  if (!record) {
    void fail(reply, "Pedido no encontrado", 404, { error: "not_found" });
    return null;
  }
  return record;
}
