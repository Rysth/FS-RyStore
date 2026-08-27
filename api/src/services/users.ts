import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { roles, userRoles, users, type User } from "../db/schema.ts";

/**
 * User listing and role assignment, extracted from
 * Api::V1::UsersController so the route handlers stay thin and the guard rules
 * can be tested directly.
 */

export type UserFilters = {
  search?: string | undefined;
  role?: string | undefined;
  page: number;
  perPage: number;
};

export type UserWithRoles = { user: User; roles: string[] };

/**
 * Replaces the ransack query. The Rails controller built a fixed hash in
 * `search_params` — the client never supplied raw ransack predicates — so this
 * is a faithful translation: exact match on role, case-insensitive contains
 * across fullname, username and email.
 */
export async function listUsers(
  filters: UserFilters,
): Promise<{ users: UserWithRoles[]; total: number }> {
  const conditions = [];

  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(users.fullname, pattern),
        ilike(users.username, pattern),
        ilike(users.email, pattern),
      )!,
    );
  }

  if (filters.role) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${userRoles}
          JOIN ${roles} ON ${roles.id} = ${userRoles.roleId}
         WHERE ${userRoles.userId} = ${users.id} AND ${roles.name} = ${filters.role}
      )`,
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const rows = await db
    .select()
    .from(users)
    .where(where)
    // Rails defaulted to `id desc`; ids are no longer sequential, so newest
    // first is expressed by creation time, which is what that ordering meant.
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(filters.perPage)
    .offset((filters.page - 1) * filters.perPage);

  return { users: await attachRoles(rows), total: countRow?.total ?? 0 };
}

/** Loads every listed user's roles in one query, avoiding an N+1. */
export async function attachRoles(rows: User[]): Promise<UserWithRoles[]> {
  if (rows.length === 0) return [];

  const roleRows = await db
    .select({ userId: userRoles.userId, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, rows.map((row) => row.id)));

  const byUser = new Map<string, string[]>();
  for (const row of roleRows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row.name);
    byUser.set(row.userId, list);
  }

  return rows.map((user) => ({ user, roles: byUser.get(user.id) ?? [] }));
}

export async function findUser(id: string): Promise<UserWithRoles | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;

  const [withRoles] = await attachRoles([user]);
  return withRoles ?? null;
}

export async function allUsersForExport(filters: Omit<UserFilters, "page" | "perPage">) {
  const { users: rows } = await listUsers({ ...filters, page: 1, perPage: 10_000 });
  return rows;
}

/** Replaces a user's roles. */
export async function replaceRoles(userId: string, roleNames: string[]): Promise<string[]> {
  const wanted = [...new Set(roleNames)];

  const roleRows =
    wanted.length > 0
      ? await db.select({ id: roles.id, name: roles.name }).from(roles).where(inArray(roles.name, wanted))
      : [];

  await db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleRows.length > 0) {
      await tx
        .insert(userRoles)
        .values(roleRows.map((role) => ({ userId, roleId: role.id })))
        .onConflictDoNothing();
    }
  });

  return roleRows.map((role) => role.name);
}

export async function listRoleNames(): Promise<string[]> {
  const rows = await db.select({ name: roles.name }).from(roles).orderBy(asc(roles.name));
  return rows.map((row) => row.name);
}
