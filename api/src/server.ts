import Fastify from "fastify";
import type { FastifyError, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import type { FastifyCorsOptions } from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { env, isProduction, isRestaurantVertical, isTest } from "./config/env.ts";
import { closeDatabase, pool } from "./db/client.ts";
import { shutdownQueue } from "./jobs/queue.ts";
import { fail } from "./lib/response.ts";
import { localObjectPath, streamLocalObject } from "./lib/storage.ts";
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
import { registerReportRoutes } from "./routes/reports.ts";
import { registerRestaurantRoutes } from "./routes/restaurant.ts";
import { registerUserRoutes } from "./routes/users.ts";
import { registerWebContentRoutes } from "./routes/web-content.ts";

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

  // Two CORS policies, one registration. @fastify/cors decorates the request
  // and refuses to be registered twice — even in an encapsulated scope — so the
  // storefront's block is expressed through the plugin's own delegator.
  //
  // The storefront half carries no credentials and allows no Authorization
  // header: nothing under /public is session-bound, and a cookie sent there
  // would be a mistake. Rails expressed this as a second `allow` block.
  //
  // The admin's own origin is allowed here too, alongside the storefront's:
  // AuthLayout and AppSidebar read /public/business to show the shop's name
  // and logo before a session exists (the sign-in screen) and as a fallback
  // while /businesses/current is still loading. Nothing under /public needs
  // a session to answer in the first place — any non-browser client can
  // already call it from anywhere — so this widens who the *browser* lets
  // read it, not what the route allows.
  await app.register(cors, {
    delegator(request: FastifyRequest, callback: (error: Error | null, options: FastifyCorsOptions) => void) {
      if (request.url.startsWith("/api/v1/public/")) {
        return callback(null, {
          origin: [
            ...(env.STOREFRONT_ALLOWED_ORIGINS ?? [env.STOREFRONT_URL]),
            ...env.ADMIN_ALLOWED_ORIGINS,
          ],
          credentials: false,
          methods: ["GET", "POST", "OPTIONS"],
          exposedHeaders: ["API-Version", "Retry-After"],
        });
      }

      callback(null, {
        origin: env.ADMIN_ALLOWED_ORIGINS,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        exposedHeaders: [
          "Content-Disposition",
          "API-Version",
          "Retry-After",
          "X-RateLimit-Limit",
          "X-RateLimit-Remaining",
          "X-RateLimit-Reset",
        ],
      });
    },
  });

  await app.register(cookie);
  // `files: 3` is the product gallery batch; `fileSize` is the video ceiling.
  // Images (2MB) and payment proofs (5MB) are checked per endpoint.
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 3 } });

  // Global fallback limit. Tighter per-route limits (auth endpoints, writes to
  // /users) are declared on the routes themselves — see middleware/rate-limit.ts.
  await app.register(rateLimit, { global: true, ...RATE_LIMITS.global });

  app.get("/uploads/*", async (request, reply) => {
    const rawKey = (request.params as { "*"?: string })["*"] ?? "";
    const filePath = await localObjectPath(decodeURIComponent(rawKey));
    if (!filePath) return fail(reply, "Archivo no encontrado", 404, { error: "not_found" });

    return reply.type(contentTypeFor(filePath)).send(streamLocalObject(filePath));
  });

  await registerAuthRoutes(app);
  await registerPublicRoutes(app);
  await registerMeRoutes(app);
  await registerPermissionRoutes(app);
  await registerDashboardRoutes(app);
  await registerBusinessRoutes(app);
  await registerProfileRoutes(app);
  await registerCategoryRoutes(app);
  await registerProductRoutes(app);
  await registerWebContentRoutes(app);
  await registerPromotionRoutes(app);
  await registerOrderRoutes(app);
  await registerCouponRoutes(app);
  await registerCustomerRoutes(app);
  await registerReportRoutes(app);
  if (isRestaurantVertical) await registerRestaurantRoutes(app);
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

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
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
