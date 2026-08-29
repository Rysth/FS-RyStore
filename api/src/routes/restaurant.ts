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
import {
  createPaidRestaurantOrder,
  deliverRestaurantOrder,
  kitchenQueue,
  listRestaurantOrders,
  markKitchenOrderReady,
  serializeKitchenOrder,
  serializeRestaurantOrder,
} from "../services/restaurant/orders.ts";
import { cashRegisterDailyReport } from "../services/restaurant/reports.ts";

const openCashRegisterSchema = z.object({
  opening_amount: z.string().trim().default("0.00"),
});

const closeCashRegisterSchema = z.object({
  closing_amount: z.string().trim(),
  notes: z.string().trim().optional(),
});

const orderItemSchema = z.object({
  product_id: z.coerce.number().int().positive("Producto inválido"),
  quantity: z.coerce.number().int().positive("La cantidad debe ser mayor a 0"),
  removed_ingredients: z.array(z.string()).default([]),
  extras: z.array(z.object({
    name: z.string().trim().min(1, "El nombre del adicional es requerido"),
    price: z.string().trim().min(1, "El precio del adicional es requerido"),
  })).default([]),
  notes: z.string().trim().nullish(),
});

const createRestaurantOrderSchema = z.object({
  customer_name: z.string().trim().min(1, "El nombre del cliente es requerido").max(60, "El nombre del cliente no puede superar 60 caracteres"),
  channel: z.enum(["local", "whatsapp", "rappi", "pedidosya", "self_order"]).default("local"),
  payment_method: z.enum(["cash", "transfer", "card", "platform"]).default("cash"),
  received_amount: z.string().trim().nullish(),
  reference: z.string().trim().nullish(),
  items: z.array(orderItemSchema).min(1, "Agrega al menos un producto").max(50, "No puedes agregar más de 50 productos en un pedido"),
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
  const canUseRestaurantOrders = requirePermission(
    PERMISSION_KEYS.MANAGE_ORDERS,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
  );
  const canReadRestaurantOrders = requirePermission(
    PERMISSION_KEYS.VIEW_ORDERS,
    PERMISSION_KEYS.MANAGE_ORDERS,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
  );
  const canViewKitchen = requirePermission(
    PERMISSION_KEYS.VIEW_KITCHEN,
    PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS,
  );
  const canCompleteKitchen = requirePermission(PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS);
  const canDeliverOrders = requirePermission(PERMISSION_KEYS.DELIVER_ORDERS);

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
      daily_report: await cashRegisterDailyReport(current.id),
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

  app.get("/api/v1/restaurant/orders", { preHandler: canReadRestaurantOrders }, async (_request, reply) => {
    const rows = await listRestaurantOrders();
    return ok(reply, { orders: rows.map(serializeRestaurantOrder) });
  });

  app.post("/api/v1/restaurant/orders", { preHandler: canUseRestaurantOrders }, async (request, reply) => {
    const values = parseOrFail(createRestaurantOrderSchema, request.body ?? {}, reply);
    if (!values) return reply;

    const result = await createPaidRestaurantOrder({
      userId: request.session!.userId,
      customerName: values.customer_name,
      channel: values.channel,
      paymentMethod: values.payment_method,
      receivedAmount: values.received_amount ?? null,
      reference: values.reference ?? null,
      items: values.items,
    });

    if (!result.success) return fail(reply, "No se pudo registrar el pedido", 422, { errors: result.errors });

    return ok(reply, { order: serializeRestaurantOrder(result.value) }, {
      message: "Pedido enviado a cocina correctamente",
      statusCode: 201,
    });
  });

  app.get("/api/v1/restaurant/kitchen/orders", { preHandler: canViewKitchen }, async (_request, reply) => {
    const rows = await kitchenQueue();
    return ok(reply, { orders: rows.map(serializeKitchenOrder) });
  });

  app.post("/api/v1/restaurant/kitchen/orders/:id/ready", { preHandler: canCompleteKitchen }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return fail(reply, "Pedido no encontrado", 404, { error: "not_found" });

    const result = await markKitchenOrderReady(id);
    if (!result.success) return fail(reply, "No se pudo marcar el pedido como listo", 422, { errors: result.errors });

    return ok(reply, { order: serializeKitchenOrder(result.value) }, {
      message: "Pedido marcado como listo",
    });
  });

  app.post("/api/v1/restaurant/orders/:id/deliver", { preHandler: canDeliverOrders }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return fail(reply, "Pedido no encontrado", 404, { error: "not_found" });

    const result = await deliverRestaurantOrder(id);
    if (!result.success) return fail(reply, "No se pudo entregar el pedido", 422, { errors: result.errors });

    return ok(reply, { order: serializeRestaurantOrder(result.value) }, {
      message: "Pedido entregado correctamente",
    });
  });

  await Promise.resolve();
}
