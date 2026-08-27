import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { permissions, rolePermissions, roles, userRoles } from "../db/schema.ts";
import { getSession, type AuthenticatedSession } from "../lib/session.ts";
import { fail } from "../lib/response.ts";
import type { PermissionKey } from "../db/seed.ts";

/**
 * Authentication and permission gates, ported from
 * backend/app/controllers/concerns/authorizable.rb and the `authenticate_*`
 * helpers in application_controller.rb.
 *
 * Semantics kept from Rails: `requirePermission` passes when the user holds
 * ANY of the listed keys (Rails aliased `authorize_any_permission!` to the same
 * method), permissions are the union across all of the user's roles, and the
 * failure messages are the same Spanish strings.
 */

declare module "fastify" {
  interface FastifyRequest {
    session?: AuthenticatedSession;
  }
}

/**
 * Resolves a user's roles and permission keys in a single query.
 *
 * Rails ran two separate queries per check (`User#permission_keys` and
 * `User#has_permission?`), each re-joining the same three tables.
 */
export async function loadAuthorization(
  userId: string,
): Promise<{ roles: string[]; permissions: string[] }> {
  const rows = await db
    .select({ role: roles.name, permission: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));

  const roleNames = new Set<string>();
  const permissionKeys = new Set<string>();
  for (const row of rows) {
    roleNames.add(row.role);
    if (row.permission) permissionKeys.add(row.permission);
  }

  return { roles: [...roleNames], permissions: [...permissionKeys] };
}

export async function hasAnyPermission(
  userId: string,
  keys: readonly PermissionKey[],
): Promise<boolean> {
  if (keys.length === 0) return false;

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(and(eq(userRoles.userId, userId), inArray(permissions.key, [...keys])));

  return (row?.count ?? 0) > 0;
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(userRoles.userId, userId), eq(roles.name, roleName)));

  return (row?.count ?? 0) > 0;
}

/**
 * Rejects unauthenticated requests. Attaches the session to the request so
 * handlers do not have to re-read the cookie.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const session = await getSession(request);
  if (!session) {
    await fail(reply, "No autenticado", 401, { error: "unauthenticated" });
    return;
  }
  request.session = session;
}

/**
 * Rejects requests whose user holds none of the given permission keys.
 * Runs `requireAuth` first, so routes only need this one hook.
 */
export function requirePermission(...keys: PermissionKey[]) {
  return async function permissionHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.session) {
      await requireAuth(request, reply);
      if (reply.sent) return;
    }

    const userId = request.session?.userId;
    if (!userId || !(await hasAnyPermission(userId, keys))) {
      await fail(reply, "No tienes permiso para realizar esta acción", 403, {
        error: "forbidden",
      });
    }
  };
}

/** Same shape as `requirePermission`, for the few checks Rails made on roles. */
export function requireRole(...roleNames: string[]) {
  return async function roleHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.session) {
      await requireAuth(request, reply);
      if (reply.sent) return;
    }

    const userId = request.session?.userId;
    if (!userId) return;

    const matches = await Promise.all(roleNames.map((name) => hasRole(userId, name)));
    if (!matches.some(Boolean)) {
      await fail(reply, "No tienes permiso para realizar esta acción", 403, {
        error: "forbidden",
      });
    }
  };
}
