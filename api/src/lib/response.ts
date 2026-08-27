import type { FastifyReply } from "fastify";

export const API_VERSION = "v1";

/**
 * Response envelope. Unlike the Rails version, `api_version` is emitted on
 * EVERY response including permission and license failures — Rails only added
 * it in BaseController#render_success/#render_error, so inline renders in
 * `enforce_license!` and `authorize_permission!` silently omitted it
 * (AGENTS.md §7 documents this as a known inconsistency).
 */
export type SuccessBody<T> = { status: "success"; api_version: string } & T;

export type ErrorBody = {
  status: "error";
  api_version: string;
  message: string;
  errors: string[];
  error?: string;
};

export function ok<T extends Record<string, unknown>>(
  reply: FastifyReply,
  data: T,
  options: { message?: string; statusCode?: number } = {},
): FastifyReply {
  // Rails' render_success took an optional message and omitted the key when
  // absent; the same applies here so responses stay free of null noise.
  return reply.code(options.statusCode ?? 200).send({
    status: "success",
    api_version: API_VERSION,
    ...(options.message ? { message: options.message } : {}),
    ...data,
  } satisfies SuccessBody<T>);
}

export function fail(
  reply: FastifyReply,
  message: string,
  statusCode = 422,
  options: { errors?: string[]; error?: string } = {},
): FastifyReply {
  const body: ErrorBody = {
    status: "error",
    api_version: API_VERSION,
    message,
    errors: options.errors ?? [],
  };
  if (options.error) body.error = options.error;
  return reply.code(statusCode).send(body);
}
