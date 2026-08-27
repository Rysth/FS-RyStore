import type { FastifyInstance } from "fastify";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { db } from "../db/client.ts";
import { accounts, users } from "../db/schema.ts";
import { requirePermission, loadAuthorization } from "../middleware/authorize.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { RATE_LIMITS } from "../middleware/rate-limit.ts";
import { generateId } from "../lib/ids.ts";
import { hashPassword } from "../lib/password.ts";
import { serializeUser } from "../lib/serializers.ts";
import { usersToXlsx } from "../lib/export.ts";
import { fail, ok } from "../lib/response.ts";
import {
  emailSchema,
  fullnameSchema,
  paginationInput,
  parseOrFail,
  passwordSchema,
  rolesInput,
  usernameSchema,
} from "../lib/validation.ts";
import {
  allUsersForExport,
  findUser,
  listUsers,
  replaceRoles,
  type UserWithRoles,
} from "../services/users.ts";
import {
  canChangeRoles,
  canDelete,
  canModify,
  canUnconfirm,
  canView,
  effectiveRoles,
  type Actor,
} from "../services/user-guards.ts";
import { enqueueEmail } from "../jobs/queue.ts";
import { env } from "../config/env.ts";

const listQuerySchema = paginationInput.extend({
  search: z.string().trim().min(1).optional(),
  role: z.string().trim().min(1).optional(),
});

const createSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  fullname: fullnameSchema,
  identification: z.string().nullish(),
  phone_number: z.string().nullish(),
  password: passwordSchema.optional(),
  roles: rolesInput,
});

const updateSchema = z.object({
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
  fullname: fullnameSchema.optional(),
  identification: z.string().nullish(),
  phone_number: z.string().nullish(),
  roles: rolesInput,
});

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  const actorFor = async (userId: string): Promise<Actor> => ({
    userId,
    roles: (await loadAuthorization(userId)).roles,
  });

  /**
   * Accepts a flat payload, and still unwraps the `user` key Rails required.
   * Roles were sent alongside that key rather than inside it, so they are
   * merged back in — otherwise an un-migrated caller's role changes would be
   * dropped silently rather than rejected.
   */
  const unwrap = (body: unknown) => {
    const payload = body as { user?: Record<string, unknown>; roles?: unknown } | undefined;
    if (!payload?.user) return body;
    return payload.roles !== undefined
      ? { ...payload.user, roles: payload.roles }
      : payload.user;
  };

  // GET /api/v1/users
  app.get(
    "/api/v1/users",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_USERS) },
    async (request, reply) => {
      const query = parseOrFail(listQuerySchema, request.query, reply);
      if (!query) return reply;

      const { users: rows, total } = await listUsers({
        search: query.search,
        role: query.role,
        page: query.page,
        perPage: query.per_page,
      });

      return ok(reply, {
        users: rows.map(({ user, roles }) => serializeUser(user, roles)),
        pagination: {
          current_page: query.page,
          total_pages: Math.max(1, Math.ceil(total / query.per_page)),
          total_count: total,
          per_page: query.per_page,
        },
      });
    },
  );

  // GET /api/v1/users/export — kept synchronous, as in Rails. UserExportJob
  // existed but the controller never enqueued it.
  app.get(
    "/api/v1/users/export",
    { preHandler: requirePermission(PERMISSION_KEYS.EXPORT_USERS) },
    async (request, reply) => {
      const query = parseOrFail(listQuerySchema.partial(), request.query, reply);
      if (!query) return reply;

      const rows = await allUsersForExport({ search: query.search, role: query.role });
      const buffer = await usersToXlsx(rows);
      // Matches Rails' `usuarios_%Y%m%d_%H%M%S.xlsx`.
      const now = new Date();
      const pad = (value: number) => String(value).padStart(2, "0");
      const stamp =
        `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
        `_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      return reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="usuarios_${stamp}.xlsx"`)
        .send(buffer);
    },
  );

  // GET /api/v1/users/:id
  app.get(
    "/api/v1/users/:id",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_USERS, PERMISSION_KEYS.EDIT_PROFILE) },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const target = await findUser(id);
      if (!target) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

      const actor = await actorFor(request.session!.userId);
      const denied = canView(actor, { userId: target.user.id, roles: target.roles });
      if (denied) return fail(reply, denied.message, denied.statusCode, { error: "forbidden" });

      return ok(reply, { user: serializeUser(target.user, target.roles) });
    },
  );

  // POST /api/v1/users
  app.post(
    "/api/v1/users",
    {
      preHandler: requirePermission(PERMISSION_KEYS.CREATE_USERS),
      config: { rateLimit: RATE_LIMITS.sensitiveWrite },
    },
    async (request, reply) => {
      const values = parseOrFail(createSchema, unwrap(request.body), reply);
      if (!values) return reply;

      const conflict = await findConflict(values.email, values.username, null);
      if (conflict) return fail(reply, conflict, 422, { errors: [conflict] });

      const actor = await actorFor(request.session!.userId);
      const userId = generateId();

      // Admin-created users are pre-verified: they never go through the email
      // verification flow, they receive an invitation instead.
      const [created] = await db
        .insert(users)
        .values({
          id: userId,
          email: values.email.toLowerCase(),
          username: values.username,
          fullname: values.fullname,
          identification: values.identification ?? null,
          phoneNumber: values.phone_number ?? null,
          emailVerified: true,
        })
        .returning();

      // Without a supplied password the account gets an unguessable one and the
      // invitation email points at the password-reset flow.
      await db.insert(accounts).values({
        id: generateId(),
        userId,
        accountId: userId,
        providerId: "credential",
        issuer: "local:credential",
        password: await hashPassword(values.password ?? randomBytes(32).toString("hex")),
      });

      const granted = values.roles?.length
        ? await replaceRoles(userId, effectiveRoles(actor, { userId, roles: [] }, values.roles))
        : [];

      // Queued rather than sent inline: a transient SMTP failure is retried
      // with backoff instead of silently costing the new user their invitation.
      try {
        await enqueueEmail({
          type: "admin_invitation",
          to: created!.email,
          fullname: created!.fullname,
          url: `${env.ADMIN_FRONTEND_URL}/identity/reset_password`,
        });
      } catch (error) {
        request.log.error({ err: error, userId }, "no se pudo encolar la invitación");
      }

      return ok(reply, { user: serializeUser(created!, granted) }, { statusCode: 201 });
    },
  );

  // PUT/PATCH /api/v1/users/:id
  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/users/:id",
      preHandler: requirePermission(PERMISSION_KEYS.EDIT_USERS),
      config: { rateLimit: RATE_LIMITS.sensitiveWrite },
      async handler(request, reply) {
        const { id } = request.params as { id: string };
        const values = parseOrFail(updateSchema, unwrap(request.body), reply);
        if (!values) return reply;

        const target = await findUser(id);
        if (!target) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

        const actor = await actorFor(request.session!.userId);
        const targetRef = { userId: target.user.id, roles: target.roles };

        const denied = canModify(actor, targetRef);
        if (denied) return fail(reply, denied.message, denied.statusCode, { error: "forbidden" });

        if (values.roles) {
          const roleDenied = canChangeRoles(actor, targetRef, values.roles);
          if (roleDenied) {
            return fail(reply, roleDenied.message, roleDenied.statusCode, { error: "forbidden" });
          }
        }

        const conflict = await findConflict(values.email, values.username, target.user.id);
        if (conflict) return fail(reply, conflict, 422, { errors: [conflict] });

        const [updated] = await db
          .update(users)
          .set({
            ...(values.email !== undefined ? { email: values.email.toLowerCase() } : {}),
            ...(values.username !== undefined ? { username: values.username } : {}),
            ...(values.fullname !== undefined ? { fullname: values.fullname } : {}),
            ...(values.identification !== undefined
              ? { identification: values.identification ?? null }
              : {}),
            ...(values.phone_number !== undefined ? { phoneNumber: values.phone_number ?? null } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, id))
          .returning();

        const finalRoles = values.roles
          ? await replaceRoles(id, effectiveRoles(actor, targetRef, values.roles))
          : target.roles;

        return ok(reply, { user: serializeUser(updated!, finalRoles) });
      },
    });
  }

  // DELETE /api/v1/users/:id
  app.delete(
    "/api/v1/users/:id",
    {
      preHandler: requirePermission(PERMISSION_KEYS.DELETE_USERS),
      config: { rateLimit: RATE_LIMITS.sensitiveWrite },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const target = await findUser(id);
      if (!target) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

      const actor = await actorFor(request.session!.userId);
      const denied = canDelete(actor, { userId: target.user.id, roles: target.roles });
      if (denied) return fail(reply, denied.message, denied.statusCode, { error: "forbidden" });

      // Sessions, credentials and role rows cascade from the schema; Rails had
      // to destroy the account separately and guard against it being gone.
      await db.delete(users).where(eq(users.id, id));

      return ok(reply, {}, { message: "Usuario eliminado correctamente" });
    },
  );

  // PUT /api/v1/users/:id/toggle_confirmation
  app.put(
    "/api/v1/users/:id/toggle_confirmation",
    {
      preHandler: requirePermission(PERMISSION_KEYS.EDIT_USERS),
      config: { rateLimit: RATE_LIMITS.sensitiveWrite },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = parseOrFail(
        z.object({ confirmed: z.coerce.boolean() }),
        request.body,
        reply,
      );
      if (!parsed) return reply;

      const target = await findUser(id);
      if (!target) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

      const actor = await actorFor(request.session!.userId);
      const targetRef = { userId: target.user.id, roles: target.roles };

      const modifyDenied = canModify(actor, targetRef);
      if (modifyDenied) {
        return fail(reply, modifyDenied.message, modifyDenied.statusCode, { error: "forbidden" });
      }

      if (parsed.confirmed) {
        if (target.user.emailVerified) {
          return ok(reply, { verified: true, account_status: "verified" }, {
            message: "El usuario ya está confirmado",
          });
        }

        await db
          .update(users)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(users.id, id));

        return ok(reply, { verified: true, account_status: "verified" }, {
          message: "Usuario confirmado correctamente",
        });
      }

      const denied = canUnconfirm(actor, targetRef);
      if (denied) return fail(reply, denied.message, denied.statusCode, { error: "forbidden" });

      await db
        .update(users)
        .set({ emailVerified: false, updatedAt: new Date() })
        .where(eq(users.id, id));

      return ok(reply, { verified: false, account_status: "unverified" }, {
        message: "Usuario desconfirmado correctamente",
      });
    },
  );

  // PUT /api/v1/users/:id/update_password
  app.put(
    "/api/v1/users/:id/update_password",
    {
      preHandler: requirePermission(PERMISSION_KEYS.EDIT_USERS),
      config: { rateLimit: RATE_LIMITS.sensitiveWrite },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = parseOrFail(
        z.object({ password: passwordSchema }),
        unwrap(request.body),
        reply,
      );
      if (!parsed) return reply;

      const target = await findUser(id);
      if (!target) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

      const actor = await actorFor(request.session!.userId);
      const denied = canModify(actor, { userId: target.user.id, roles: target.roles });
      if (denied) return fail(reply, denied.message, denied.statusCode, { error: "forbidden" });

      const hash = await hashPassword(parsed.password);
      const updated = await db
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")))
        .returning({ id: accounts.id });

      // A user migrated without a password hash has no credential row yet.
      if (updated.length === 0) {
        await db.insert(accounts).values({
          id: generateId(),
          userId: id,
          accountId: id,
          providerId: "credential",
          issuer: "local:credential",
          password: hash,
        });
      }

      return ok(reply, {}, { message: "Contraseña actualizada correctamente" });
    },
  );
}

/** Returns a Spanish message when email or username is already taken. */
async function findConflict(
  email: string | undefined,
  username: string | undefined,
  excludeUserId: string | null,
): Promise<string | null> {
  if (email) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        excludeUserId
          ? and(sql`lower(${users.email}) = ${email.toLowerCase()}`, ne(users.id, excludeUserId))
          : sql`lower(${users.email}) = ${email.toLowerCase()}`,
      )
      .limit(1);
    if (taken) return "Ya existe una cuenta con este correo electrónico";
  }

  if (username) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        excludeUserId
          ? and(sql`lower(${users.username}) = ${username.toLowerCase()}`, ne(users.id, excludeUserId))
          : sql`lower(${users.username}) = ${username.toLowerCase()}`,
      )
      .limit(1);
    if (taken) return "Este nombre de usuario ya está en uso";
  }

  return null;
}

export type { UserWithRoles };
