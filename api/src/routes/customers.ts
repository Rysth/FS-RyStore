import type { FastifyInstance, FastifyReply } from "fastify";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { customers, orders } from "../db/schema.ts";
import type { Customer } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { paginationInput, parseOrFail } from "../lib/validation.ts";
import { unwrap } from "../lib/multipart.ts";
import { normalizePhone } from "../services/customers.ts";

/**
 * Port of Api::V1::CustomersController — "Contactos" in the admin.
 *
 * Most contacts are born from order-creator the first time a phone number
 * places an order, but the shop can also add one by hand here: a lead who has
 * not ordered yet, for instance. There is no destroy — a contact carries the
 * order history that OrderCreator matches against.
 */

const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 1000;
const RECENT_ORDERS = 20;

const SORTS = {
  total_spent: desc(customers.totalSpent),
  orders_count: desc(customers.ordersCount),
} as const;

const listQuerySchema = paginationInput.extend({
  search: z.string().trim().min(1).optional(),
  sort: z.string().trim().optional(),
});

const customerSchema = z.object({
  name: z.string().nullish(),
  phone: z.string().optional(),
  address: z.string().nullish(),
  city: z.string().nullish(),
  notes: z.string().nullish(),
});

function validateCustomer(attributes: { name?: string | null; notes?: string | null }): string[] {
  const errors: string[] = [];
  if (attributes.name && attributes.name.length > MAX_NAME_LENGTH) {
    errors.push(`El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres`);
  }
  if (attributes.notes && attributes.notes.length > MAX_NOTES_LENGTH) {
    errors.push(`Las notas no pueden tener más de ${MAX_NOTES_LENGTH} caracteres`);
  }
  return errors;
}

export function serializeCustomer(customer: Customer) {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    notes: customer.notes,
    orders_count: customer.ordersCount,
    total_spent: customer.totalSpent,
    last_order_at: customer.lastOrderAt,
    created_at: customer.createdAt,
    updated_at: customer.updatedAt,
  };
}

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_CONTACTS, PERMISSION_KEYS.MANAGE_CONTACTS);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_CONTACTS);

  app.get("/api/v1/customers", { preHandler: canRead }, async (request, reply) => {
    const query = parseOrFail(listQuerySchema, request.query, reply);
    if (!query) return reply;

    const where = query.search
      ? sql`(${customers.name} ilike ${`%${query.search}%`} or ${customers.phone} ilike ${`%${query.search}%`})`
      : undefined;

    const [{ count = 0 } = {}] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(where);

    // Anything outside the whitelist falls back to "most recent order", which
    // is the screen's default reading order.
    const order = SORTS[query.sort as keyof typeof SORTS] ?? desc(customers.lastOrderAt);

    const rows = await db
      .select()
      .from(customers)
      .where(where)
      .orderBy(order, desc(customers.id))
      .limit(query.per_page)
      .offset((query.page - 1) * query.per_page);

    return ok(reply, {
      customers: rows.map(serializeCustomer),
      pagination: {
        current_page: query.page,
        total_pages: Math.max(1, Math.ceil(count / query.per_page)),
        total_count: count,
        per_page: query.per_page,
      },
    });
  });

  app.get("/api/v1/customers/:id", { preHandler: canRead }, async (request, reply) => {
    const customer = await loadOrFail(request.params, reply);
    if (!customer) return reply;

    const recent = await db
      .select({
        id: orders.id,
        number: orders.number,
        status: orders.status,
        total: orders.total,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.customerId, customer.id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(RECENT_ORDERS);

    return ok(reply, {
      customer: serializeCustomer(customer),
      orders: recent.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        created_at: order.createdAt,
      })),
    });
  });

  app.post("/api/v1/customers", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(customerSchema, unwrap(request.body, "customer"), reply);
    if (!values) return reply;

    const phone = normalizePhone(values.phone);
    const errors = validateCustomer(values);
    if (!phone) errors.push("El teléfono es requerido");
    if (errors.length === 0 && (await phoneTaken(phone))) {
      errors.push("El teléfono ya está registrado");
    }
    if (errors.length > 0) return fail(reply, "No se pudo crear el contacto", 422, { errors });

    const [created] = await db
      .insert(customers)
      .values({
        name: values.name ?? null,
        phone,
        address: values.address ?? null,
        city: values.city ?? null,
        notes: values.notes ?? null,
      })
      .returning();

    return ok(reply, { customer: serializeCustomer(created!) }, {
      message: "Contacto creado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/customers/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const customer = await loadOrFail(request.params, reply);
        if (!customer) return reply;

        const values = parseOrFail(customerSchema, unwrap(request.body, "customer"), reply);
        if (!values) return reply;

        const errors = validateCustomer(values);
        if (errors.length > 0) {
          return fail(reply, "No se pudo actualizar el contacto", 422, { errors });
        }

        // `phone` is deliberately not settable here: it is the contact's
        // identity key, and letting it change would silently merge or fork the
        // history order-creator relies on to find this same contact next time.
        const [updated] = await db
          .update(customers)
          .set({
            ...(values.name !== undefined ? { name: values.name } : {}),
            ...(values.address !== undefined ? { address: values.address } : {}),
            ...(values.city !== undefined ? { city: values.city } : {}),
            ...(values.notes !== undefined ? { notes: values.notes } : {}),
            updatedAt: new Date(),
          })
          .where(eq(customers.id, customer.id))
          .returning();

        return ok(reply, { customer: serializeCustomer(updated!) }, {
          message: "Contacto actualizado correctamente",
        });
      },
    });
  }

  await Promise.resolve();
}

async function phoneTaken(phone: string): Promise<boolean> {
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, phone))
    .limit(1);
  return Boolean(row);
}

async function loadOrFail(params: unknown, reply: FastifyReply): Promise<Customer | null> {
  const id = Number((params as { id: string }).id);
  if (!Number.isInteger(id)) {
    void fail(reply, "Contacto no encontrado", 404, { error: "not_found" });
    return null;
  }
  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) {
    void fail(reply, "Contacto no encontrado", 404, { error: "not_found" });
    return null;
  }
  return customer;
}
