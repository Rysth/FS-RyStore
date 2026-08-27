import type { FastifyReply } from "fastify";
import { z } from "zod";
import { fail } from "./response.ts";

/**
 * Replaces Rails' strong parameters. A failed parse answers 422 with the
 * project envelope and Spanish field messages, matching what the admin stores
 * already expect from validation failures.
 */
export function parseOrFail<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const errors = result.error.issues.map((issue) => {
    const field = issue.path.join(".");
    return field ? `${field}: ${issue.message}` : issue.message;
  });

  void fail(reply, "Los datos enviados no son válidos", 422, { errors });
  return null;
}

/**
 * Roles arrive as an array. Rails passed them as a comma-separated string
 * (`params[:roles].split(',')`), so strings are still accepted and split —
 * it costs three lines and keeps an un-migrated caller from silently wiping
 * a user's roles.
 */
export const rolesInput = z
  .preprocess(
    (value) =>
      typeof value === "string"
        ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
        : value,
    z.array(z.string().min(1)),
  )
  .optional();

export const paginationInput = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(12),
});

/** Matches the username format Rails enforced on both User and Rodauth. */
export const usernameSchema = z
  .string()
  .min(1, "El nombre de usuario es requerido")
  .regex(/^[a-zA-Z0-9_]+$/, "Solo se permiten letras, números y guiones bajos");

export const emailSchema = z
  .string()
  .min(1, "El correo electrónico es requerido")
  .email("Formato de correo electrónico inválido");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña no puede superar los 72 caracteres");

export const fullnameSchema = z.string().min(1, "El nombre completo es requerido");
