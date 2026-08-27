import type { FastifyInstance, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { promotions } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { booleanInput, parseOrFail } from "../lib/validation.ts";
import { fileNamed, readMultipart, truthy, unwrap } from "../lib/multipart.ts";
import { IMAGE_CONTENT_TYPES } from "../lib/images.ts";
import {
  deleteObjectQuietly,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadAsset,
} from "../lib/storage.ts";
import {
  findPromotion,
  listPromotions,
  loadCatalog,
  nextPosition,
  normalizeItems,
  replaceItems,
  serializePromotion,
  slugForPromotion,
  validateItems,
  validatePromotion,
} from "../services/promotions.ts";
import type { PromotionRecord } from "../services/promotions.ts";

/**
 * Port of Api::V1::PromotionsController.
 *
 * Combos live under the catalog permissions rather than getting their own pair:
 * a combo is a way of selling the catalog, and a shop that can edit products
 * can edit the bundles made of them.
 */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_ERRORS = {
  missing: "Debes adjuntar una imagen",
  type: "La imagen debe ser formato JPG, PNG o WEBP",
  size: "La imagen debe ser menor a 2MB",
} as const;

const dateInput = z
  .union([z.string(), z.date(), z.null()])
  .transform((value) => {
    if (value === null || value === "") return null;
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });

const promotionSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullish(),
  price: z.union([z.string(), z.number()]).optional(),
  active: booleanInput.optional(),
  position: z.coerce.number().int().min(0).optional(),
  starts_at: dateInput.optional(),
  ends_at: dateInput.optional(),
  items: z.array(z.record(z.unknown())).optional(),
});

export async function registerPromotionRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_CATALOG, PERMISSION_KEYS.MANAGE_CATALOG);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_CATALOG);

  app.get("/api/v1/promotions", { preHandler: canRead }, async (request, reply) => {
    const query = request.query as { active?: string };
    const rows = await listPromotions(
      query.active === undefined ? {} : { active: truthy(query.active) },
    );
    return ok(reply, { promotions: rows.map((row) => serializePromotion(row)) });
  });

  app.get("/api/v1/promotions/:id", { preHandler: canRead }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;
    return ok(reply, { promotion: serializePromotion(record) });
  });

  app.post("/api/v1/promotions", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(promotionSchema, unwrap(request.body, "promotion"), reply);
    if (!values) return reply;

    const name = (values.name ?? "").trim();
    const price = String(values.price ?? "0");
    const items = normalizeItems(values.items ?? []);
    const catalog = await loadCatalog(items.map((item) => item.productId));

    const errors = [
      ...validatePromotion({
        name,
        description: values.description ?? null,
        price,
        startsAt: values.starts_at ?? null,
        endsAt: values.ends_at ?? null,
      }),
      ...validateItems(items, catalog, price),
    ];
    if (errors.length > 0) return fail(reply, "No se pudo crear el combo", 422, { errors });

    const promotionId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(promotions)
        .values({
          name,
          slug: await slugForPromotion(name),
          description: values.description ?? null,
          price,
          active: values.active ?? true,
          position: values.position && values.position > 0 ? values.position : await nextPosition(),
          startsAt: values.starts_at ?? null,
          endsAt: values.ends_at ?? null,
        })
        .returning({ id: promotions.id });

      await replaceItems(tx, created!.id, items);
      return created!.id;
    });

    return ok(reply, { promotion: serializePromotion((await findPromotion(promotionId))!) }, {
      message: "Combo creado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/promotions/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const record = await loadOrFail(request.params, reply);
        if (!record) return reply;

        const values = parseOrFail(promotionSchema, unwrap(request.body, "promotion"), reply);
        if (!values) return reply;

        const current = record.promotion;
        const name = values.name === undefined ? current.name : values.name.trim();
        const price = values.price === undefined ? current.price : String(values.price);
        const description =
          values.description === undefined ? current.description : values.description ?? null;
        const startsAt = values.starts_at === undefined ? current.startsAt : values.starts_at;
        const endsAt = values.ends_at === undefined ? current.endsAt : values.ends_at;

        // An absent `items` key leaves the stored bundle alone; the validation
        // still runs against it, because the price may have moved under it.
        const items =
          values.items === undefined
            ? record.items.map((item, position) => ({
                productId: item.productId,
                quantity: item.quantity,
                position,
              }))
            : normalizeItems(values.items);
        const catalog = await loadCatalog(items.map((item) => item.productId));

        const errors = [
          ...validatePromotion({ name, description, price, startsAt, endsAt }),
          ...validateItems(items, catalog, price),
        ];
        if (errors.length > 0) return fail(reply, "No se pudo actualizar el combo", 422, { errors });

        await db.transaction(async (tx) => {
          await tx
            .update(promotions)
            .set({
              name,
              ...(values.name !== undefined && name !== current.name
                ? { slug: await slugForPromotion(name, current.id) }
                : {}),
              description,
              price,
              ...(values.active !== undefined ? { active: values.active } : {}),
              ...(values.position !== undefined ? { position: values.position } : {}),
              startsAt,
              endsAt,
              updatedAt: new Date(),
            })
            .where(eq(promotions.id, current.id));

          if (values.items !== undefined) await replaceItems(tx, current.id, items);
        });

        return ok(reply, { promotion: serializePromotion((await findPromotion(current.id))!) }, {
          message: "Combo actualizado correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/promotions/:id", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    // promotion_items cascade; order_items keep their frozen contents_label.
    await db.delete(promotions).where(eq(promotions.id, record.promotion.id));
    await deleteObjectQuietly(record.promotion.imageKey);

    return ok(reply, {}, { message: "Combo eliminado correctamente" });
  });

  // Its own endpoint for the same reason the product's is: the promotion
  // payload carries the nested items array, and multipart cannot express it.
  app.post("/api/v1/promotions/:id/image", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const { files } = await readMultipart(request);
    const image = fileNamed(files, "image");
    if (!image) return fail(reply, IMAGE_ERRORS.missing, 422, { errors: [IMAGE_ERRORS.missing] });

    if (!isStorageConfigured()) {
      return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    }
    if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
      return fail(reply, IMAGE_ERRORS.size, 422, { errors: [IMAGE_ERRORS.size] });
    }
    if (!IMAGE_CONTENT_TYPES.includes(image.contentType)) {
      return fail(reply, IMAGE_ERRORS.type, 422, { errors: [IMAGE_ERRORS.type] });
    }

    let imageKey: string;
    try {
      imageKey = await uploadAsset(image, {
        folder: `promotions/${record.promotion.id}`,
        prefix: "image",
        optimizeAs: "promotion",
      });
    } catch (error) {
      request.log.error({ err: error }, "fallo al subir la imagen del combo");
      return fail(reply, "No se pudo guardar la imagen. Inténtalo de nuevo.", 502, {
        error: "storage_unavailable",
      });
    }

    await db
      .update(promotions)
      .set({ imageKey, updatedAt: new Date() })
      .where(eq(promotions.id, record.promotion.id));
    await deleteObjectQuietly(record.promotion.imageKey);

    return ok(reply, { promotion: serializePromotion((await findPromotion(record.promotion.id))!) }, {
      message: "Imagen actualizada correctamente",
    });
  });

  app.delete("/api/v1/promotions/:id/image", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    await db
      .update(promotions)
      .set({ imageKey: null, updatedAt: new Date() })
      .where(eq(promotions.id, record.promotion.id));
    await deleteObjectQuietly(record.promotion.imageKey);

    return ok(reply, { promotion: serializePromotion((await findPromotion(record.promotion.id))!) }, {
      message: "Imagen eliminada correctamente",
    });
  });

  await Promise.resolve();
}

async function loadOrFail(params: unknown, reply: FastifyReply): Promise<PromotionRecord | null> {
  const id = Number((params as { id: string }).id);
  const record = Number.isInteger(id) ? await findPromotion(id) : null;
  if (!record) {
    void fail(reply, "Combo no encontrado", 404, { error: "not_found" });
    return null;
  }
  return record;
}
