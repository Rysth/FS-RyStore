import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { permissions, rolePermissions, roles } from "../db/schema.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { ok } from "../lib/response.ts";

/**
 * GET /api/v1/permissions — the catalogue plus the role mapping, for the
 * permission-management UI. Ported from Api::V1::PermissionsController, which
 * gated this on VIEW_USERS.
 */
export async function registerPermissionRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/permissions",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_USERS) },
    async (_request, reply) => {
      const permissionRows = await db
        .select({
          id: permissions.id,
          key: permissions.key,
          name: permissions.name,
          description: permissions.description,
          group: permissions.group,
        })
        .from(permissions)
        .orderBy(asc(permissions.group), asc(permissions.name));

      // Rails used `Role.includes(:permissions)`; one join replaces it.
      const mappingRows = await db
        .select({ roleId: roles.id, roleName: roles.name, key: permissions.key })
        .from(roles)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
        .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .orderBy(asc(roles.name));

      const byRole = new Map<number, { id: number; name: string; permissions: string[] }>();
      for (const row of mappingRows) {
        const entry = byRole.get(row.roleId) ?? { id: row.roleId, name: row.roleName, permissions: [] };
        if (row.key) entry.permissions.push(row.key);
        byRole.set(row.roleId, entry);
      }

      return ok(reply, { permissions: permissionRows, roles: [...byRole.values()] });
    },
  );
}
