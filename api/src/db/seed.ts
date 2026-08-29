import { sql } from "drizzle-orm";
import { isRestaurantVertical } from "../config/env.ts";
import { closeDatabase, db } from "./client.ts";
import { permissions, rolePermissions, roles } from "./schema.ts";

/**
 * RBAC seed data, carried over verbatim from
 * backend/app/models/permission.rb (ALL_KEYS, ROLE_DEFAULTS, seed!).
 *
 * Permission keys must stay in sync with the `Permissions` const in
 * admin/src/types/auth.ts. The store vertical uses the original 18 keys;
 * HungerApp adds restaurant-only keys when APP_VERTICAL=restaurant.
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
  VIEW_CATALOG: "view_catalog",
  MANAGE_CATALOG: "manage_catalog",
  VIEW_ORDERS: "view_orders",
  MANAGE_ORDERS: "manage_orders",
  VIEW_COUPONS: "view_coupons",
  MANAGE_COUPONS: "manage_coupons",
  VIEW_CONTACTS: "view_contacts",
  MANAGE_CONTACTS: "manage_contacts",
  VIEW_REPORTS: "view_reports",
  VIEW_CASH_REGISTER: "view_cash_register",
  MANAGE_CASH_REGISTER: "manage_cash_register",
  DELIVER_ORDERS: "deliver_orders",
  VIEW_KITCHEN: "view_kitchen",
  COMPLETE_KITCHEN_ORDERS: "complete_kitchen_orders",
  CHARGE_PAYMENTS: "charge_payments",
  VOID_PAYMENTS: "void_payments",
  VIEW_KITCHEN_METRICS: "view_kitchen_metrics",
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS];

type PermissionDefinition = {
  key: PermissionKey;
  name: string;
  group: string;
  description: string;
};

const STORE_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: PERMISSION_KEYS.VIEW_DASHBOARD, name: "Ver Dashboard", group: "dashboard", description: "Acceso al panel de control" },
  { key: PERMISSION_KEYS.VIEW_USERS, name: "Ver Usuarios", group: "users", description: "Ver la lista de usuarios" },
  { key: PERMISSION_KEYS.CREATE_USERS, name: "Crear Usuarios", group: "users", description: "Crear nuevos usuarios" },
  { key: PERMISSION_KEYS.EDIT_USERS, name: "Editar Usuarios", group: "users", description: "Editar usuarios existentes" },
  { key: PERMISSION_KEYS.DELETE_USERS, name: "Eliminar Usuarios", group: "users", description: "Eliminar usuarios" },
  { key: PERMISSION_KEYS.EXPORT_USERS, name: "Exportar Usuarios", group: "users", description: "Exportar datos de usuarios" },
  { key: PERMISSION_KEYS.VIEW_BUSINESS, name: "Ver Negocio", group: "business", description: "Ver configuración del negocio" },
  { key: PERMISSION_KEYS.EDIT_BUSINESS, name: "Editar Negocio", group: "business", description: "Editar configuración del negocio" },
  { key: PERMISSION_KEYS.EDIT_PROFILE, name: "Editar Perfil", group: "profile", description: "Editar perfil propio" },
  { key: PERMISSION_KEYS.VIEW_CATALOG, name: "Ver Catálogo", group: "catalog", description: "Ver productos, categorías y combos" },
  { key: PERMISSION_KEYS.MANAGE_CATALOG, name: "Gestionar Catálogo", group: "catalog", description: "Crear, editar y eliminar productos, categorías y combos" },
  { key: PERMISSION_KEYS.VIEW_ORDERS, name: "Ver Pedidos", group: "orders", description: "Ver la lista y el detalle de pedidos" },
  { key: PERMISSION_KEYS.MANAGE_ORDERS, name: "Gestionar Pedidos", group: "orders", description: "Registrar pedidos y cambiar su estado" },
  { key: PERMISSION_KEYS.VIEW_COUPONS, name: "Ver Cupones", group: "coupons", description: "Ver la lista de cupones" },
  { key: PERMISSION_KEYS.MANAGE_COUPONS, name: "Gestionar Cupones", group: "coupons", description: "Crear, editar y eliminar cupones" },
  { key: PERMISSION_KEYS.VIEW_CONTACTS, name: "Ver Contactos", group: "contacts", description: "Ver la lista de clientes" },
  { key: PERMISSION_KEYS.MANAGE_CONTACTS, name: "Gestionar Contactos", group: "contacts", description: "Crear y editar clientes" },
  { key: PERMISSION_KEYS.VIEW_REPORTS, name: "Ver Reportes", group: "reports", description: "Ver y exportar reportes de ventas" },
];

const RESTAURANT_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: PERMISSION_KEYS.VIEW_CASH_REGISTER, name: "Ver Caja", group: "restaurant", description: "Ver el estado y los totales de la caja" },
  { key: PERMISSION_KEYS.MANAGE_CASH_REGISTER, name: "Gestionar Caja", group: "restaurant", description: "Abrir y cerrar turnos de caja" },
  { key: PERMISSION_KEYS.DELIVER_ORDERS, name: "Entregar Pedidos", group: "restaurant", description: "Marcar pedidos listos como entregados" },
  { key: PERMISSION_KEYS.VIEW_KITCHEN, name: "Ver Cocina", group: "restaurant", description: "Ver la cola de pedidos en cocina" },
  { key: PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS, name: "Completar Pedidos de Cocina", group: "restaurant", description: "Marcar pedidos como listos desde cocina" },
  { key: PERMISSION_KEYS.CHARGE_PAYMENTS, name: "Cobrar Pedidos", group: "restaurant", description: "Registrar cobros de pedidos" },
  { key: PERMISSION_KEYS.VOID_PAYMENTS, name: "Anular Cobros", group: "restaurant", description: "Anular cobros mientras la caja esté abierta" },
  { key: PERMISSION_KEYS.VIEW_KITCHEN_METRICS, name: "Ver Métricas de Cocina", group: "restaurant", description: "Ver tiempos de preparación y rendimiento de cocina" },
];

const PERMISSION_DEFINITIONS = isRestaurantVertical
  ? [...STORE_PERMISSION_DEFINITIONS, ...RESTAURANT_PERMISSION_DEFINITIONS]
  : STORE_PERMISSION_DEFINITIONS;

const ALL_KEYS = PERMISSION_DEFINITIONS.map((definition) => definition.key);

const STORE_ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  admin: ALL_KEYS,
  // Identical to admin: same permission set, and login is a single step for
  // both since the admin OTP gate was removed (AGENTS.md §4, §6).
  manager: ALL_KEYS,
  // The shop clerk: takes orders and looks things up, but does not touch the
  // catalog, users, coupons, contacts or reports.
  operator: [
    PERMISSION_KEYS.VIEW_DASHBOARD,
    PERMISSION_KEYS.EDIT_PROFILE,
    PERMISSION_KEYS.VIEW_CATALOG,
    PERMISSION_KEYS.VIEW_ORDERS,
    PERMISSION_KEYS.MANAGE_ORDERS,
  ],
  user: [PERMISSION_KEYS.EDIT_PROFILE],
};

const RESTAURANT_ROLE_DEFAULTS: Record<string, PermissionKey[]> = {
  admin: ALL_KEYS,
  manager: [
    PERMISSION_KEYS.VIEW_DASHBOARD,
    PERMISSION_KEYS.EDIT_PROFILE,
    PERMISSION_KEYS.VIEW_CATALOG,
    PERMISSION_KEYS.MANAGE_CATALOG,
    PERMISSION_KEYS.VIEW_ORDERS,
    PERMISSION_KEYS.MANAGE_ORDERS,
    PERMISSION_KEYS.DELIVER_ORDERS,
    PERMISSION_KEYS.VIEW_CASH_REGISTER,
    PERMISSION_KEYS.MANAGE_CASH_REGISTER,
    PERMISSION_KEYS.VIEW_KITCHEN,
    PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
    PERMISSION_KEYS.VOID_PAYMENTS,
    PERMISSION_KEYS.VIEW_REPORTS,
    PERMISSION_KEYS.VIEW_KITCHEN_METRICS,
  ],
  cashier: [
    PERMISSION_KEYS.EDIT_PROFILE,
    PERMISSION_KEYS.VIEW_CATALOG,
    PERMISSION_KEYS.VIEW_ORDERS,
    PERMISSION_KEYS.MANAGE_ORDERS,
    PERMISSION_KEYS.DELIVER_ORDERS,
    PERMISSION_KEYS.VIEW_CASH_REGISTER,
    PERMISSION_KEYS.MANAGE_CASH_REGISTER,
    PERMISSION_KEYS.CHARGE_PAYMENTS,
  ],
  kitchen: [
    PERMISSION_KEYS.VIEW_KITCHEN,
    PERMISSION_KEYS.COMPLETE_KITCHEN_ORDERS,
  ],
  operator: [PERMISSION_KEYS.VIEW_DASHBOARD, PERMISSION_KEYS.EDIT_PROFILE],
  user: [PERMISSION_KEYS.EDIT_PROFILE],
};

export const ROLE_DEFAULTS: Record<string, PermissionKey[]> = isRestaurantVertical
  ? RESTAURANT_ROLE_DEFAULTS
  : STORE_ROLE_DEFAULTS;

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
