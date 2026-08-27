import { sql } from "drizzle-orm";
import { closeDatabase, db } from "./client.ts";
import { permissions, rolePermissions, roles } from "./schema.ts";

/**
 * RBAC seed data, carried over verbatim from
 * backend/app/models/permission.rb (ALL_KEYS, ROLE_DEFAULTS, seed!).
 *
 * The 9 permission keys must stay in sync with the `Permissions` const in
 * admin/src/types/auth.ts (AGENTS.md §6).
 *
 * Idempotent: safe to run on every boot and on every deploy.
 */

export const PERMISSION_KEYS = {
  VIEW_DASHBOARD: "view_dashboard",
  VIEW_USERS: "view_users",
  CREATE_USERS: "create_users",
  EDIT_USERS: "edit_users",
  DELETE_USERS: "delete_users",
  EXPORT_USERS: "export_users",
  VIEW_BUSINESS: "view_business",
  EDIT_BUSINESS: "edit_business",
  EDIT_PROFILE: "edit_profile",
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  name: string;
  group: string;
  description: string;
}> = [
  { key: PERMISSION_KEYS.VIEW_DASHBOARD, name: "Ver Dashboard", group: "dashboard", description: "Acceso al panel de control" },
  { key: PERMISSION_KEYS.VIEW_USERS, name: "Ver Usuarios", group: "users", description: "Ver la lista de usuarios" },
  { key: PERMISSION_KEYS.CREATE_USERS, name: "Crear Usuarios", group: "users", description: "Crear nuevos usuarios" },
  { key: PERMISSION_KEYS.EDIT_USERS, name: "Editar Usuarios", group: "users", description: "Editar usuarios existentes" },
  { key: PERMISSION_KEYS.DELETE_USERS, name: "Eliminar Usuarios", group: "users", description: "Eliminar usuarios" },
  { key: PERMISSION_KEYS.EXPORT_USERS, name: "Exportar Usuarios", group: "users", description: "Exportar datos de usuarios" },
  { key: PERMISSION_KEYS.VIEW_BUSINESS, name: "Ver Negocio", group: "business", description: "Ver configuración del negocio" },
  { key: PERMISSION_KEYS.EDIT_BUSINESS, name: "Editar Negocio", group: "business", description: "Editar configuración del negocio" },
  { key: PERMISSION_KEYS.EDIT_PROFILE, name: "Editar Perfil", group: "profile", description: "Editar perfil propio" },
];

const ALL_KEYS = PERMISSION_DEFINITIONS.map((definition) => definition.key);

export const ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  admin: ALL_KEYS,
  // Identical to admin: same permission set, and login is a single step for
  // both since the admin OTP gate was removed (AGENTS.md §4, §6).
  manager: ALL_KEYS,
  operator: [PERMISSION_KEYS.VIEW_DASHBOARD, PERMISSION_KEYS.EDIT_PROFILE],
  user: [PERMISSION_KEYS.EDIT_PROFILE],
};

export async function seedRbac(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(permissions)
      .values(PERMISSION_DEFINITIONS)
      .onConflictDoUpdate({
        target: permissions.key,
        set: {
          name: sql`excluded.name`,
          group: sql`excluded."group"`,
          description: sql`excluded.description`,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(roles)
      .values(Object.keys(ROLE_DEFAULTS).map((name) => ({ name })))
      .onConflictDoNothing({ target: roles.name });

    const [permissionRows, roleRows] = await Promise.all([
      tx.select({ id: permissions.id, key: permissions.key }).from(permissions),
      tx.select({ id: roles.id, name: roles.name }).from(roles),
    ]);

    const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));
    const roleIdByName = new Map(roleRows.map((row) => [row.name, row.id]));

    const pairs = Object.entries(ROLE_DEFAULTS).flatMap(([roleName, keys]) => {
      const roleId = roleIdByName.get(roleName);
      if (roleId === undefined) return [];
      return keys.flatMap((key) => {
        const permissionId = permissionIdByKey.get(key);
        return permissionId === undefined ? [] : [{ roleId, permissionId }];
      });
    });

    if (pairs.length > 0) {
      await tx.insert(rolePermissions).values(pairs).onConflictDoNothing();
    }
  });
}

const isEntrypoint = process.argv[1] && import.meta.filename === process.argv[1];

if (isEntrypoint) {
  await seedRbac();
  const [permissionCount] = await db.select({ count: sql<number>`count(*)::int` }).from(permissions);
  const [roleCount] = await db.select({ count: sql<number>`count(*)::int` }).from(roles);
  const [pairCount] = await db.select({ count: sql<number>`count(*)::int` }).from(rolePermissions);
  console.log(
    `Semillas RBAC aplicadas: ${permissionCount?.count} permisos, ${roleCount?.count} roles, ${pairCount?.count} asignaciones`,
  );
  await closeDatabase();
}
