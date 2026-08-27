import type { FastifyInstance } from "fastify";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { accounts, users } from "../db/schema.ts";
import { requireAuth, loadAuthorization } from "../middleware/authorize.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { serializeUser } from "../lib/serializers.ts";
import {
  emailSchema,
  fullnameSchema,
  parseOrFail,
  passwordSchema,
  usernameSchema,
} from "../lib/validation.ts";
import { fail, ok } from "../lib/response.ts";

/**
 * The signed-in user editing their own details.
 * Ported from Api::V1::ProfileController.
 */

const updateInfoSchema = z.object({
  email: emailSchema.optional(),
  username: usernameSchema.optional(),
  fullname: fullnameSchema.optional(),
  identification: z.string().nullish(),
  phone_number: z.string().nullish(),
});

const updatePasswordSchema = z
  .object({
    current_password: z.string().min(1, "La contraseña actual es requerida"),
    password: passwordSchema,
    password_confirmation: z.string().optional(),
  })
  .refine(
    (value) => value.password_confirmation === undefined || value.password === value.password_confirmation,
    { message: "Las contraseñas no coinciden", path: ["password_confirmation"] },
  );

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.put("/api/v1/profile/update_info", { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session!.userId;
    // Rails nested these under a `profile` key via `params.require(:profile)`.
    const body = (request.body as { profile?: unknown })?.profile ?? request.body;

    const values = parseOrFail(updateInfoSchema, body, reply);
    if (!values) return reply;

    // Uniqueness is enforced by indexes too; checking first turns a 500 into a
    // field-level message.
    if (values.email) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = ${values.email.toLowerCase()}`, ne(users.id, userId)))
        .limit(1);
      if (taken) return fail(reply, "Este correo electrónico ya está en uso", 422);
    }

    if (values.username) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(sql`lower(${users.username}) = ${values.username.toLowerCase()}`, ne(users.id, userId)),
        )
        .limit(1);
      if (taken) return fail(reply, "Este nombre de usuario ya está en uso", 422);
    }

    const [updated] = await db
      .update(users)
      .set({
        ...(values.email !== undefined ? { email: values.email.toLowerCase() } : {}),
        ...(values.username !== undefined ? { username: values.username } : {}),
        ...(values.fullname !== undefined ? { fullname: values.fullname } : {}),
        ...(values.identification !== undefined ? { identification: values.identification ?? null } : {}),
        ...(values.phone_number !== undefined ? { phoneNumber: values.phone_number ?? null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) return fail(reply, "Usuario no encontrado", 404, { error: "not_found" });

    const { roles } = await loadAuthorization(userId);
    return ok(reply, { user: serializeUser(updated, roles) });
  });

  app.put("/api/v1/profile/update_password", { preHandler: requireAuth }, async (request, reply) => {
    const userId = request.session!.userId;
    const body = (request.body as { profile?: unknown })?.profile ?? request.body;

    const values = parseOrFail(updatePasswordSchema, body, reply);
    if (!values) return reply;

    const [credential] = await db
      .select({ id: accounts.id, password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
      .limit(1);

    if (!credential?.password) {
      return fail(reply, "Esta cuenta no tiene una contraseña configurada", 422);
    }

    const matches = await verifyPassword({ hash: credential.password, password: values.current_password });
    if (!matches) return fail(reply, "La contraseña actual es incorrecta", 401);

    await db
      .update(accounts)
      .set({ password: await hashPassword(values.password), updatedAt: new Date() })
      .where(eq(accounts.id, credential.id));

    return ok(reply, {}, { message: "Contraseña actualizada correctamente" });
  });
}
