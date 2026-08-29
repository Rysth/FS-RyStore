import type { FastifyInstance } from "fastify";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { ok } from "../lib/response.ts";

export async function registerRestaurantRoutes(app: FastifyInstance): Promise<void> {
  const canOpenRestaurant = requirePermission(
    PERMISSION_KEYS.VIEW_CASH_REGISTER,
    PERMISSION_KEYS.MANAGE_CASH_REGISTER,
    PERMISSION_KEYS.VIEW_KITCHEN,
    PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
  );

  app.get("/api/v1/restaurant/status", { preHandler: canOpenRestaurant }, async (_request, reply) =>
    ok(reply, {
      restaurant: {
        enabled: true,
        modules: ["orders", "cash_register", "kitchen"],
      },
    }),
  );

  await Promise.resolve();
}
