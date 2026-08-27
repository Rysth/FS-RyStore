import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { requirePermission } from "../middleware/authorize.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { getBusiness, updateBusiness } from "../services/business.ts";
import { serializeBusiness } from "../lib/serializers.ts";
import { parseOrFail } from "../lib/validation.ts";
import { fail, ok } from "../lib/response.ts";
import {
  deleteObject,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadLogo,
  validateLogo,
  type LogoUpload,
} from "../lib/storage.ts";

/**
 * Business settings. Ported from Api::V1::BusinessesController.
 *
 * Rails exposed `show`, `update` and a `current` collection route, where `show`
 * special-cased the literal id "current". Since the deployment holds exactly one
 * business, all of them resolve to the same row; `current` is kept because the
 * admin calls it, and `:id` is accepted for compatibility but ignored.
 */

// Format validations carried over from the Business model.
const businessSchema = z.object({
  name: z
    .string()
    .min(1, "es requerido")
    .max(100, "no puede tener más de 100 caracteres")
    .optional(),
  slogan: z.string().max(200, "no puede tener más de 200 caracteres").nullish(),
  whatsapp: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, "debe ser un número de teléfono válido")
    .or(z.literal(""))
    .nullish(),
  instagram: z
    .string()
    .regex(/^[a-zA-Z0-9._]+$/, "debe ser un nombre de usuario de Instagram válido")
    .or(z.literal(""))
    .nullish(),
  facebook: z
    .string()
    .regex(/^[a-zA-Z0-9.]+$/, "debe ser un nombre de usuario de Facebook válido")
    .or(z.literal(""))
    .nullish(),
  tiktok: z
    .string()
    .regex(/^[a-zA-Z0-9._]+$/, "debe ser un nombre de usuario de TikTok válido")
    .or(z.literal(""))
    .nullish(),
});

/**
 * The logo arrives as multipart when present and as plain JSON when not, so
 * both shapes have to be unpacked into the same object.
 */
async function readPayload(
  request: FastifyRequest,
): Promise<{ fields: Record<string, unknown>; logo: LogoUpload | null }> {
  if (!request.isMultipart()) {
    return { fields: (request.body ?? {}) as Record<string, unknown>, logo: null };
  }

  const fields: Record<string, unknown> = {};
  let logo: LogoUpload | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      // @fastify/multipart caps this at 2MB (configured in server.ts); the
      // explicit size check in validateLogo still runs for a clearer message.
      logo = {
        buffer: await part.toBuffer(),
        filename: part.filename,
        contentType: part.mimetype,
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  return { fields, logo };
}

export async function registerBusinessRoutes(app: FastifyInstance): Promise<void> {
  const readHandler = async (_request: FastifyRequest, reply: Parameters<typeof ok>[0]) => {
    const business = await getBusiness();
    return ok(reply, { business: serializeBusiness(business) });
  };

  app.get(
    "/api/v1/businesses/current",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_BUSINESS) },
    readHandler,
  );

  app.get(
    "/api/v1/businesses/:id",
    { preHandler: requirePermission(PERMISSION_KEYS.VIEW_BUSINESS) },
    readHandler,
  );

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/businesses/:id",
      preHandler: requirePermission(PERMISSION_KEYS.EDIT_BUSINESS),
      async handler(request, reply) {
        const business = await getBusiness();
        const { fields, logo } = await readPayload(request);

        const values = parseOrFail(businessSchema, fields, reply);
        if (!values) return reply;

        let logoKey = business.logoKey;
        if (logo) {
          if (!isStorageConfigured()) {
            return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
          }

          const problem = validateLogo(logo);
          if (problem) return fail(reply, problem, 422, { errors: [problem] });

          const previousKey = business.logoKey;
          try {
            logoKey = await uploadLogo(business.id, logo);
          } catch (error) {
            // A storage outage is an infrastructure problem, not a bad request:
            // say so plainly instead of returning a generic 500.
            request.log.error({ err: error }, "fallo al subir el logo a R2");
            return fail(
              reply,
              "No se pudo guardar el logo. El servicio de almacenamiento no está disponible.",
              502,
              { error: "storage_unavailable" },
            );
          }

          // Delete only after the replacement is safely stored, so a failed
          // upload cannot leave the business with no logo at all.
          if (previousKey && previousKey !== logoKey) {
            try {
              await deleteObject(previousKey);
            } catch (error) {
              request.log.warn({ err: error, key: previousKey }, "no se pudo borrar el logo anterior");
            }
          }
        }

        const updated = await updateBusiness(business.id, {
          ...(values.name !== undefined ? { name: values.name } : {}),
          ...(values.slogan !== undefined ? { slogan: values.slogan ?? null } : {}),
          ...(values.whatsapp !== undefined ? { whatsapp: values.whatsapp ?? null } : {}),
          ...(values.instagram !== undefined ? { instagram: values.instagram ?? null } : {}),
          ...(values.facebook !== undefined ? { facebook: values.facebook ?? null } : {}),
          ...(values.tiktok !== undefined ? { tiktok: values.tiktok ?? null } : {}),
          logoKey,
        });

        return ok(reply, { business: serializeBusiness(updated) });
      },
    });
  }
}
