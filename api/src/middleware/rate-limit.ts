import type { FastifyRequest } from "fastify";
import { API_VERSION } from "../lib/response.ts";

/**
 * Rate-limit policies, ported from config/initializers/rack_attack.rb.
 *
 * Two of the original throttles key on the submitted email rather than the IP,
 * which is what makes them useful: an attacker rotating IPs against one account
 * still hits the limit. That behaviour is preserved here.
 *
 * The `blocklist('block_bad_ips')` rule is not ported — it read from a cache key
 * nothing ever wrote to, so it could never match.
 *
 * Counters live in this process. These deployments run a single api container
 * (AGENTS.md §1), so that is equivalent to what Solid Cache gave Rack::Attack,
 * without the per-request database round trip.
 */

function emailFromBody(request: FastifyRequest): string | null {
  const body = request.body as { email?: unknown } | undefined;
  const email = body?.email;
  return typeof email === "string" && email.length > 0 ? email.trim().toLowerCase() : null;
}

/** Keys on the submitted email, falling back to IP when none was sent. */
function emailKey(request: FastifyRequest): string {
  return emailFromBody(request) ?? request.ip;
}

export function rateLimitError(retryAfterSeconds: number) {
  return {
    // @fastify/rate-limit throws this object rather than sending it, so it
    // travels through the error handler; `statusCode` is what keeps it a 429
    // instead of being flattened into a generic 500.
    statusCode: 429,
    status: "error" as const,
    api_version: API_VERSION,
    message: "Demasiadas solicitudes. Inténtalo de nuevo en unos momentos.",
    errors: [] as string[],
    error: "rate_limited",
    retry_after: retryAfterSeconds,
  };
}

const builder = (max: number, timeWindow: string, keyGenerator?: (request: FastifyRequest) => string) => ({
  max,
  timeWindow,
  // Email-keyed policies must run after body parsing. The plugin defaults to
  // `onRequest`, where `request.body` is still undefined and every caller would
  // silently collapse onto the IP fallback.
  ...(keyGenerator ? { keyGenerator, hook: "preHandler" as const } : {}),
  errorResponseBuilder: (_request: FastifyRequest, context: { ttl: number }) =>
    rateLimitError(Math.ceil(context.ttl / 1000)),
});

/**
 * The storefront renders server-side, so every catalog read for every visitor
 * arrives from one address — the SSR container's. Without this exemption the
 * entire shop shares a single 300-request bucket and goes down at peak.
 *
 * rack_attack called this safelist "storefront/internal_reads". It covers GETs
 * only: the checkout POST and the browser-side filtering arrive through the
 * proxy carrying the buyer's own IP and stay rate limited.
 */
const PRIVATE_IPV4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateAddress(ip: string): boolean {
  const address = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (address === "::1" || address === "localhost") return true;
  // fc00::/7 — unique local addresses.
  if (/^f[cd][0-9a-f]{2}:/i.test(address)) return true;
  return PRIVATE_IPV4.some((pattern) => pattern.test(address));
}

export function isInternalStorefrontRead(request: FastifyRequest): boolean {
  return (
    request.method === "GET" &&
    request.url.startsWith("/api/v1/public/") &&
    isPrivateAddress(request.ip)
  );
}

export const RATE_LIMITS = {
  /** rack_attack: api/requests/ip — 300 per 5 minutes across the whole API. */
  global: { ...builder(300, "5 minutes"), allowList: isInternalStorefrontRead },

  /** rack_attack: api/auth/email — 5 per 20 seconds, keyed by email. */
  login: builder(5, "20 seconds", emailKey),

  /** rack_attack: api/password_reset/email — 3 per hour, keyed by email. */
  passwordReset: builder(3, "1 hour", emailKey),

  /** rack_attack: api/signup/ip — 10 per hour. */
  signup: builder(10, "1 hour"),

  /** rack_attack: api/sensitive/ip — 60 per 5 minutes on writes to /users. */
  sensitiveWrite: builder(60, "5 minutes"),

  /** rack_attack: api/public_orders/ip — 20 checkouts per hour per buyer IP. */
  publicOrders: builder(20, "1 hour"),
} as const;
