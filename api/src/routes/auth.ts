import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { auth } from "../auth.ts";
import { API_VERSION } from "../lib/response.ts";
import {
  FALLBACK_AUTH_ERROR,
  translateAuthError,
  translateAuthSuccess,
} from "../lib/auth-errors.ts";
import { RATE_LIMITS } from "../middleware/rate-limit.ts";

/**
 * Mounts better-auth under /api/v1/auth/*.
 *
 * better-auth speaks the web Fetch API, so the Fastify request is adapted to a
 * Request and its Response is streamed back. Error responses are translated to
 * Spanish (AGENTS.md §3) and reshaped into the project envelope; successful
 * responses keep better-auth's payload, which the frontend reads directly.
 */
async function handleAuth(request: FastifyRequest, reply: FastifyReply) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
    else headers.append(key, String(value));
  }

  const response = await auth.handler(
    new Request(url, {
      method: request.method,
      headers,
      body: request.body ? JSON.stringify(request.body) : undefined,
    }),
  );

  reply.status(response.status);
  for (const [key, value] of response.headers) {
    // set-cookie must be appended rather than replaced: better-auth emits more
    // than one on a single response.
    if (key.toLowerCase() === "set-cookie") reply.header("set-cookie", value);
    else reply.header(key, value);
  }

  const raw = response.body ? await response.text() : null;
  if (!raw) return reply.send(raw);

  if (response.status < 400) {
    // Keep better-auth's shape, but swap any English copy meant for display.
    try {
      const body = JSON.parse(raw) as { message?: string };
      const translated = translateAuthSuccess(body?.message);
      if (translated) return reply.send({ ...body, message: translated });
    } catch {
      /* not JSON: pass through untouched */
    }
    return reply.send(raw);
  }

  let parsed: { code?: string; message?: string } | null = null;
  try {
    parsed = JSON.parse(raw) as { code?: string; message?: string };
  } catch {
    return reply.send(raw);
  }

  const translated = translateAuthError(parsed?.code);
  if (!translated && parsed?.code) {
    // Surface unmapped codes instead of silently shipping English.
    request.log.warn(
      { code: parsed.code, original: parsed.message },
      "código de error de better-auth sin traducción",
    );
  }

  return reply.send({
    status: "error",
    api_version: API_VERSION,
    message: translated ?? FALLBACK_AUTH_ERROR,
    errors: [],
    // Kept so the admin can branch on the specific failure.
    code: parsed?.code ?? null,
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  // Paths needing a tighter limit than the catch-all. Fastify matches exact
  // routes before wildcards, so these win over the /* registration below.
  // Limits are ported from config/initializers/rack_attack.rb.
  const throttled = [
    ["/api/v1/auth/sign-in/email", RATE_LIMITS.login],
    ["/api/v1/auth/sign-up/email", RATE_LIMITS.signup],
    ["/api/v1/auth/request-password-reset", RATE_LIMITS.passwordReset],
    ["/api/v1/auth/reset-password", RATE_LIMITS.passwordReset],
  ] as const;

  for (const [url, rateLimit] of throttled) {
    app.route({ method: ["GET", "POST"], url, config: { rateLimit }, handler: handleAuth });
  }

  app.route({
    method: ["GET", "POST"],
    url: "/api/v1/auth/*",
    config: { rateLimit: RATE_LIMITS.global },
    handler: handleAuth,
  });
}
