import Fastify from "fastify";
import type { FastifyError } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { env, isProduction, isTest } from "./config/env.ts";
import { closeDatabase, pool } from "./db/client.ts";
import { shutdownQueue } from "./jobs/queue.ts";
import { fail } from "./lib/response.ts";
import { RATE_LIMITS } from "./middleware/rate-limit.ts";
import { registerAuthRoutes } from "./routes/auth.ts";
import { registerBusinessRoutes } from "./routes/businesses.ts";
import { registerCategoryRoutes } from "./routes/categories.ts";
import { registerCouponRoutes } from "./routes/coupons.ts";
import { registerCustomerRoutes } from "./routes/customers.ts";
import { registerDashboardRoutes } from "./routes/dashboard.ts";
import { registerMeRoutes } from "./routes/me.ts";
import { registerOrderRoutes } from "./routes/orders.ts";
import { registerPermissionRoutes } from "./routes/permissions.ts";
import { registerProductRoutes } from "./routes/products.ts";
import { registerProfileRoutes } from "./routes/profile.ts";
import { registerPromotionRoutes } from "./routes/promotions.ts";
import { registerPublicRoutes } from "./routes/public.ts";
import { registerUserRoutes } from "./routes/users.ts";

export async function buildServer() {
  const app = Fastify({
    logger: isTest
      ? false
      : isProduction
      ? { level: process.env.LOG_LEVEL ?? "info" }
      : {
          level: process.env.LOG_LEVEL ?? "info",
          transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } },
        },
    // Traefik terminates TLS in front of this service (see docker-compose.yml
    // labels), so client IPs used for rate limiting arrive via X-Forwarded-For.
    trustProxy: true,
    // Headroom for the largest upload the API accepts (a 20MB product video).
    // Per-endpoint ceilings are enforced in the handlers so each one can answer
    // with its own Spanish message instead of a generic 413.
    bodyLimit: 21 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: env.ADMIN_ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposedHeaders: ["Content-Disposition", "API-Version", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
  });

  await app.register(cookie);
  // `files: 3` is the product gallery batch; `fileSize` is the video ceiling.
  // Images (2MB) and payment proofs (5MB) are checked per endpoint.
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 3 } });

  // Global fallback limit. Tighter per-route limits (auth endpoints, writes to
  // /users) are declared on the routes themselves — see middleware/rate-limit.ts.
  await app.register(rateLimit, { global: true, ...RATE_LIMITS.global });

  await registerAuthRoutes(app);
  await registerPublicRoutes(app);
  await registerMeRoutes(app);
  await registerPermissionRoutes(app);
  await registerDashboardRoutes(app);
  await registerBusinessRoutes(app);
  await registerProfileRoutes(app);
  await registerCategoryRoutes(app);
  await registerProductRoutes(app);
  await registerPromotionRoutes(app);
  await registerOrderRoutes(app);
  await registerCouponRoutes(app);
  await registerCustomerRoutes(app);
  await registerUserRoutes(app);

  app.setNotFoundHandler((request, reply) =>
    fail(reply, `Ruta no encontrada: ${request.method} ${request.url}`, 404, { error: "not_found" }),
  );

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Some plugins (notably @fastify/rate-limit) signal by throwing a body that
    // is already in our envelope shape. Pass those straight through so their
    // detail — retry_after, the specific error code — survives.
    const thrown = error as unknown as Record<string, unknown>;
    if (thrown.status === "error" && typeof thrown.api_version === "string") {
      const { statusCode: _ignored, ...body } = thrown;
      return reply.code(statusCode).send(body);
    }

    if (statusCode >= 500) {
      request.log.error({ err: error }, "unhandled error");
      return fail(reply, "Ocurrió un error en el servidor. Inténtalo de nuevo más tarde.", 500, {
        error: "internal_error",
      });
    }
    return fail(reply, error.message, statusCode);
  });

  // Health check, unauthenticated. Compose gates the admin and worker
  // containers on this, and it only answers once migrations and the seed have
  // finished, so a passing check means the API is genuinely ready.
  app.get("/up", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return reply.code(200).send({ status: "ok", database: "ok" });
    } catch {
      return reply.code(503).send({ status: "error", database: "unreachable" });
    }
  });

  return app;
}

const isEntrypoint = process.argv[1] && import.meta.filename === process.argv[1];

if (isEntrypoint) {
  const app = await buildServer();

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} recibido, cerrando...`);
    await app.close();
    await shutdownQueue();
    await closeDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}
