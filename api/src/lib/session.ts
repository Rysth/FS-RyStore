import type { FastifyRequest } from "fastify";
import { auth } from "../auth.ts";

export type AuthenticatedSession = {
  userId: string;
  email: string;
  fullname: string;
  username: string;
  emailVerified: boolean;
};

/**
 * Reads the better-auth session from a Fastify request.
 *
 * Auth is cookie/session based, exactly as it was under Rodauth — there is no
 * bearer token to parse (AGENTS.md §4). Returns null when there is no valid
 * session; callers decide whether that is a 401.
 */
export async function getSession(request: FastifyRequest): Promise<AuthenticatedSession | null> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry));
    else headers.append(key, String(value));
  }

  const result = await auth.api.getSession({ headers });
  if (!result?.user) return null;

  const user = result.user as typeof result.user & {
    username?: string;
    closedAt?: Date | null;
  };

  // A closed account keeps its row for referential integrity but must not be
  // able to act (Rodauth's close_account left status = 3 behind).
  if (user.closedAt) return null;

  return {
    userId: user.id,
    email: user.email,
    fullname: user.name,
    username: user.username ?? "",
    emailVerified: user.emailVerified,
  };
}
