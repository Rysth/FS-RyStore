import type { FastifyInstance } from "fastify";
import { getBusiness } from "../services/business.ts";
import { serializeBusiness } from "../lib/serializers.ts";
import { ok } from "../lib/response.ts";

/**
 * GET /api/v1/public/business — unauthenticated business details.
 *
 * Ported from Api::V1::Public::BusinessesController. This is the only route in
 * the API that needs no session.
 */
export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/public/business", async (_request, reply) => {
    const business = await getBusiness();
    const { created_at: _c, updated_at: _u, ...publicFields } = serializeBusiness(business);
    return ok(reply, { business: publicFields });
  });
}
