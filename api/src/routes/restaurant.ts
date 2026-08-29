import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { fail, ok } from "../lib/response.ts";
import { parseOrFail } from "../lib/validation.ts";
import { requirePermission } from "../middleware/authorize.ts";
import {
  closeCashRegister,
  findOpenCashRegister,
  liveTotals,
  openCashRegister,
  serializeCashRegister,
} from "../services/restaurant/cash-registers.ts";

const openCashRegisterSchema = z.object({
  opening_amount: z.string().trim().default("0.00"),
});

const closeCashRegisterSchema = z.object({
  closing_amount: z.string().trim(),
  notes: z.string().trim().optional(),
});

export async function registerRestaurantRoutes(app: FastifyInstance): Promise<void> {
  const canOpenRestaurant = requirePermission(
    PERMISSION_KEYS.VIEW_CASH_REGISTER,
    PERMISSION_KEYS.MANAGE_CASH_REGISTER,
    PERMISSION_KEYS.VIEW_KITCHEN,
    PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
  );
  const canViewCashRegister = requirePermission(
    PERMISSION_KEYS.VIEW_CASH_REGISTER,
    PERMISSION_KEYS.MANAGE_CASH_REGISTER,
  );
  const canManageCashRegister = requirePermission(PERMISSION_KEYS.MANAGE_CASH_REGISTER);

  app.get("/api/v1/restaurant/status", { preHandler: canOpenRestaurant }, async (_request, reply) => {
    const current = await findOpenCashRegister();
    return ok(reply, {
      restaurant: {
        enabled: true,
        modules: ["orders", "cash_register", "kitchen"],
        cash_register_open: current !== null,
      },
    });
  });

  app.get("/api/v1/restaurant/cash-register/current", { preHandler: canViewCashRegister }, async (_request, reply) => {
    const current = await findOpenCashRegister();
    if (!current) return ok(reply, { cash_register: null, live_totals: null });

    return ok(reply, {
      cash_register: serializeCashRegister(current),
      live_totals: await liveTotals(current.id),
    });
  });

  app.post("/api/v1/restaurant/cash-register/open", { preHandler: canManageCashRegister }, async (request, reply) => {
    const values = parseOrFail(openCashRegisterSchema, request.body ?? {}, reply);
    if (!values) return reply;

    const result = await openCashRegister({
      userId: request.session!.userId,
      openingAmount: values.opening_amount,
    });

    if (!result.success) return fail(reply, "No se pudo abrir la caja", 422, { errors: result.errors });

    return ok(reply, { cash_register: serializeCashRegister(result.value) }, {
      message: "Caja abierta correctamente",
      statusCode: 201,
    });
  });

  app.post("/api/v1/restaurant/cash-register/:id/close", { preHandler: canManageCashRegister }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return fail(reply, "Caja no encontrada", 404, { error: "not_found" });

    const values = parseOrFail(closeCashRegisterSchema, request.body ?? {}, reply);
    if (!values) return reply;

    const result = await closeCashRegister({
      id,
      userId: request.session!.userId,
      closingAmount: values.closing_amount,
      notes: values.notes ?? null,
    });

    if (!result.success) return fail(reply, "No se pudo cerrar la caja", 422, { errors: result.errors });

    return ok(reply, { cash_register: serializeCashRegister(result.value) }, {
      message: "Caja cerrada correctamente",
    });
  });

  await Promise.resolve();
}
