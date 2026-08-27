import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { requireAuth, loadAuthorization } from "../middleware/authorize.ts";
import { accountStatus } from "../lib/serializers.ts";
import { fail, ok } from "../lib/response.ts";

/**
 * GET /api/v1/me — the identity payload the admin SPA bootstraps from.
 *
 * Ported from Api::V1::MeController. The Rails version had a fallback that read
 * `session[:account_id]` directly when Rodauth had not populated the request,
 * a workaround for its custom OTP flow clearing and rebuilding the session by
 * hand. better-auth owns the session end to end, so that path is gone.
 */
export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/me", { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session!.userId;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return fail(reply, "Perfil de usuario no encontrado", 404, { error: "not_found" });

    const { roles, permissions } = await loadAuthorization(userId);

    return ok(reply, {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullname: user.fullname,
        roles,
        permissions,
        verified: user.emailVerified && !user.closedAt,
        account_status: accountStatus(user),
        created_at: user.createdAt.toISOString(),
        updated_at: user.updatedAt.toISOString(),
      },
    });
  });
}
