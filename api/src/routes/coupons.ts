import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { coupons, DISCOUNT_TYPES } from "../db/schema.ts";
import type { Coupon } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { booleanInput, paginationInput, parseOrFail } from "../lib/validation.ts";
import { unwrap } from "../lib/multipart.ts";
import { toCents, ZERO } from "../lib/money.ts";

/** Port of Api::V1::CouponsController and app/models/coupon.rb. */

const MAX_CODE_LENGTH = 40;
const CODE_FORMAT = /^[A-Z0-9_-]+$/;

const listQuerySchema = paginationInput.extend({
  search: z.string().trim().min(1).optional(),
});

const dateInput = z.union([z.string(), z.date(), z.null()]).transform((value) => {
  if (value === null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
});

const couponSchema = z.object({
  code: z.string().optional(),
  discount_type: z.string().optional(),
  discount_value: z.union([z.string(), z.number()]).optional(),
  active: booleanInput.optional(),
  starts_at: dateInput.optional(),
  expires_at: dateInput.optional(),
  usage_limit: z.coerce.number().int().nullish(),
  min_order_total: z.union([z.string(), z.number(), z.null()]).optional(),
});

type CouponAttributes = {
  code: string;
  discountType: string;
  discountValue: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  minOrderTotal: string | null;
};

/** Stored already upper-cased, so lookups can use the unique index directly. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function validateCoupon(attributes: CouponAttributes): string[] {
  const errors: string[] = [];

  if (!attributes.code) errors.push("El código es requerido");
  else if (attributes.code.length > MAX_CODE_LENGTH) {
    errors.push(`El código no puede tener más de ${MAX_CODE_LENGTH} caracteres`);
  } else if (!CODE_FORMAT.test(attributes.code)) {
    errors.push("El código solo puede tener letras, números, guiones y guiones bajos");
  }

  if (!(DISCOUNT_TYPES as readonly string[]).includes(attributes.discountType)) {
    errors.push("El tipo de descuento no es válido");
  }

  const value = toCents(attributes.discountValue);
  if (value <= ZERO) {
    errors.push("El descuento debe ser mayor a 0");
  } else if (attributes.discountType === "percentage" && value > 10_000n) {
    errors.push("El descuento no puede ser mayor a 100%");
  }

  if (attributes.usageLimit !== null && attributes.usageLimit <= 0) {
    errors.push("El límite de usos debe ser mayor a 0");
  }
  if (attributes.minOrderTotal !== null && toCents(attributes.minOrderTotal) < ZERO) {
    errors.push("El total mínimo debe ser mayor o igual a 0");
  }
  if (attributes.startsAt && attributes.expiresAt && attributes.expiresAt <= attributes.startsAt) {
    errors.push("La fecha de expiración debe ser posterior a la fecha de inicio");
  }

  return errors;
}

export async function codeTaken(code: string, currentId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(currentId ? and(eq(coupons.code, code), ne(coupons.id, currentId)) : eq(coupons.code, code))
    .limit(1);
  return Boolean(row);
}

export function serializeCoupon(coupon: Coupon) {
  return {
    id: coupon.id,
    code: coupon.code,
    discount_type: coupon.discountType,
    discount_value: coupon.discountValue,
    active: coupon.active,
    starts_at: coupon.startsAt,
    expires_at: coupon.expiresAt,
    usage_limit: coupon.usageLimit,
    usage_count: coupon.usageCount,
    min_order_total: coupon.minOrderTotal,
    created_at: coupon.createdAt,
    updated_at: coupon.updatedAt,
  };
}

export async function registerCouponRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_COUPONS, PERMISSION_KEYS.MANAGE_COUPONS);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_COUPONS);

  app.get("/api/v1/coupons", { preHandler: canRead }, async (request, reply) => {
    const query = parseOrFail(listQuerySchema, request.query, reply);
    if (!query) return reply;

    const where = query.search ? sql`${coupons.code} ilike ${`%${query.search}%`}` : undefined;

    const [{ count = 0 } = {}] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(coupons)
      .where(where);

    const rows = await db
      .select()
      .from(coupons)
      .where(where)
      .orderBy(desc(coupons.createdAt), desc(coupons.id))
      .limit(query.per_page)
      .offset((query.page - 1) * query.per_page);

    return ok(reply, {
      coupons: rows.map(serializeCoupon),
      pagination: {
        current_page: query.page,
        total_pages: Math.max(1, Math.ceil(count / query.per_page)),
        total_count: count,
        per_page: query.per_page,
      },
    });
  });

  app.get("/api/v1/coupons/:id", { preHandler: canRead }, async (request, reply) => {
    const coupon = await loadOrFail(request.params, reply);
    if (!coupon) return reply;
    return ok(reply, { coupon: serializeCoupon(coupon) });
  });

  app.post("/api/v1/coupons", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(couponSchema, unwrap(request.body, "coupon"), reply);
    if (!values) return reply;

    const attributes: CouponAttributes = {
      code: normalizeCode(values.code ?? ""),
      discountType: values.discount_type ?? "percentage",
      discountValue: String(values.discount_value ?? "0"),
      startsAt: values.starts_at ?? null,
      expiresAt: values.expires_at ?? null,
      usageLimit: values.usage_limit ?? null,
      minOrderTotal: values.min_order_total == null ? null : String(values.min_order_total),
    };

    const errors = validateCoupon(attributes);
    if (errors.length === 0 && (await codeTaken(attributes.code))) {
      errors.push("El código ya está en uso");
    }
    if (errors.length > 0) return fail(reply, "No se pudo crear el cupón", 422, { errors });

    const [created] = await db
      .insert(coupons)
      .values({ ...attributes, active: values.active ?? true })
      .returning();

    return ok(reply, { coupon: serializeCoupon(created!) }, {
      message: "Cupón creado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/coupons/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const coupon = await loadOrFail(request.params, reply);
        if (!coupon) return reply;

        const values = parseOrFail(couponSchema, unwrap(request.body, "coupon"), reply);
        if (!values) return reply;

        const attributes: CouponAttributes = {
          code: values.code === undefined ? coupon.code : normalizeCode(values.code),
          discountType: values.discount_type ?? coupon.discountType,
          discountValue:
            values.discount_value === undefined ? coupon.discountValue : String(values.discount_value),
          startsAt: values.starts_at === undefined ? coupon.startsAt : values.starts_at,
          expiresAt: values.expires_at === undefined ? coupon.expiresAt : values.expires_at,
          usageLimit: values.usage_limit === undefined ? coupon.usageLimit : values.usage_limit,
          minOrderTotal:
            values.min_order_total === undefined
              ? coupon.minOrderTotal
              : values.min_order_total == null
              ? null
              : String(values.min_order_total),
        };

        const errors = validateCoupon(attributes);
        if (errors.length === 0 && (await codeTaken(attributes.code, coupon.id))) {
          errors.push("El código ya está en uso");
        }
        if (errors.length > 0) return fail(reply, "No se pudo actualizar el cupón", 422, { errors });

        const [updated] = await db
          .update(coupons)
          .set({
            ...attributes,
            ...(values.active !== undefined ? { active: values.active } : {}),
            updatedAt: new Date(),
          })
          .where(eq(coupons.id, coupon.id))
          .returning();

        return ok(reply, { coupon: serializeCoupon(updated!) }, {
          message: "Cupón actualizado correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/coupons/:id", { preHandler: canWrite }, async (request, reply) => {
    const coupon = await loadOrFail(request.params, reply);
    if (!coupon) return reply;

    // orders.coupon_id is ON DELETE SET NULL: a past order keeps its frozen
    // discount_amount and simply stops naming the coupon.
    await db.delete(coupons).where(eq(coupons.id, coupon.id));

    return ok(reply, {}, { message: "Cupón eliminado correctamente" });
  });

  await Promise.resolve();
}

async function loadOrFail(params: unknown, reply: FastifyReply): Promise<Coupon | null> {
  const id = Number((params as { id: string }).id);
  if (!Number.isInteger(id)) {
    void fail(reply, "Cupón no encontrado", 404, { error: "not_found" });
    return null;
  }
  const [coupon] = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
  if (!coupon) {
    void fail(reply, "Cupón no encontrado", 404, { error: "not_found" });
    return null;
  }
  return coupon;
}
