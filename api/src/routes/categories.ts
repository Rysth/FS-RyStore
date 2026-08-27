import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { categories } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { parseOrFail } from "../lib/validation.ts";
import { fileNamed, readMultipart, truthy, unwrap } from "../lib/multipart.ts";
import { IMAGE_CONTENT_TYPES } from "../lib/images.ts";
import {
  deleteObjectQuietly,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadAsset,
} from "../lib/storage.ts";
import {
  findCategory,
  listCategories,
  MAX_NAME_LENGTH,
  nameTaken,
  nextPosition,
  refreshProductsCount,
  reorderCategories,
  serializeCategory,
  slugForCategory,
} from "../services/categories.ts";

/** Port of Api::V1::CategoriesController. */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_ERRORS = {
  type: "La imagen debe ser formato JPG, PNG o WEBP",
  size: "La imagen debe ser menor a 2MB",
} as const;

const categorySchema = z.object({
  name: z.string().trim().min(1, "es requerido").max(MAX_NAME_LENGTH, `no puede tener más de ${MAX_NAME_LENGTH} caracteres`).optional(),
  active: z.coerce.boolean().optional(),
  featured: z.coerce.boolean().optional(),
  position: z.coerce.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  positions: z
    .array(z.object({ id: z.coerce.number().int(), position: z.coerce.number().int() }))
    .min(1, "No se recibió el nuevo orden de las categorías"),
});

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_CATALOG, PERMISSION_KEYS.MANAGE_CATALOG);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_CATALOG);

  app.get("/api/v1/categories", { preHandler: canRead }, async (request, reply) => {
    const query = request.query as { active?: string };
    const rows = await listCategories(
      query.active === undefined ? {} : { active: truthy(query.active) },
    );
    return ok(reply, { categories: rows.map(serializeCategory) });
  });

  // Must be declared before /:id, or "reorder" is parsed as an id.
  app.put("/api/v1/categories/reorder", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(reorderSchema, request.body, reply);
    if (!values) return reply;

    await reorderCategories(values.positions);
    const rows = await listCategories();
    return ok(reply, { categories: rows.map(serializeCategory) }, {
      message: "Orden actualizado correctamente",
    });
  });

  app.get("/api/v1/categories/:id", { preHandler: canRead }, async (request, reply) => {
    const category = await findCategory(Number((request.params as { id: string }).id));
    if (!category) return fail(reply, "Categoría no encontrada", 404, { error: "not_found" });
    return ok(reply, { category: serializeCategory(category) });
  });

  app.post("/api/v1/categories", { preHandler: canWrite }, async (request, reply) => {
    const { fields, files } = await readMultipart(request);
    const values = parseOrFail(categorySchema, unwrap(fields, "category"), reply);
    if (!values) return reply;

    if (!values.name) return fail(reply, "El nombre es requerido", 422, { errors: ["name: es requerido"] });
    if (await nameTaken(values.name)) {
      return fail(reply, "No se pudo crear la categoría", 422, {
        errors: ["El nombre ya está en uso"],
      });
    }

    const [created] = await db
      .insert(categories)
      .values({
        name: values.name,
        slug: await slugForCategory(values.name),
        active: values.active ?? true,
        featured: values.featured ?? false,
        position: values.position && values.position > 0 ? values.position : await nextPosition(),
      })
      .returning();

    const withImage = await syncImage(request, reply, created!, fields, files);
    if (withImage === null) return reply;

    return ok(reply, { category: serializeCategory(withImage) }, {
      message: "Categoría creada correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/categories/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const category = await findCategory(Number((request.params as { id: string }).id));
        if (!category) return fail(reply, "Categoría no encontrada", 404, { error: "not_found" });

        const { fields, files } = await readMultipart(request);
        const values = parseOrFail(categorySchema, unwrap(fields, "category"), reply);
        if (!values) return reply;

        if (values.name && (await nameTaken(values.name, category.id))) {
          return fail(reply, "No se pudo actualizar la categoría", 422, {
            errors: ["El nombre ya está en uso"],
          });
        }

        const [updated] = await db
          .update(categories)
          .set({
            ...(values.name ? { name: values.name, slug: await slugForCategory(values.name, category.id) } : {}),
            ...(values.active !== undefined ? { active: values.active } : {}),
            ...(values.featured !== undefined ? { featured: values.featured } : {}),
            ...(values.position !== undefined ? { position: values.position } : {}),
            updatedAt: new Date(),
          })
          .where(eq(categories.id, category.id))
          .returning();

        const withImage = await syncImage(request, reply, updated!, fields, files);
        if (withImage === null) return reply;

        return ok(reply, { category: serializeCategory(withImage) }, {
          message: "Categoría actualizada correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/categories/:id", { preHandler: canWrite }, async (request, reply) => {
    const category = await findCategory(Number((request.params as { id: string }).id));
    if (!category) return fail(reply, "Categoría no encontrada", 404, { error: "not_found" });

    // products.category_id is ON DELETE SET NULL, so the products survive
    // uncategorised rather than disappearing with the category.
    await db.delete(categories).where(eq(categories.id, category.id));
    await deleteObjectQuietly(category.imageKey);

    return ok(reply, {}, { message: "Categoría eliminada correctamente" });
  });

  await Promise.resolve();
}

/**
 * `image` and `remove_image` travel at the top level of the multipart body,
 * outside the `category` wrapper — that is how the admin sends them.
 * Returns null when it already answered with an error.
 */
async function syncImage(
  request: FastifyRequest,
  reply: FastifyReply,
  category: typeof categories.$inferSelect,
  fields: Record<string, unknown>,
  files: Awaited<ReturnType<typeof readMultipart>>["files"],
): Promise<typeof categories.$inferSelect | null> {
  if (truthy(fields.remove_image)) {
    await deleteObjectQuietly(category.imageKey);
    const [updated] = await db
      .update(categories)
      .set({ imageKey: null, updatedAt: new Date() })
      .where(eq(categories.id, category.id))
      .returning();
    return updated!;
  }

  const image = fileNamed(files, "image");
  if (!image) return category;

  if (!isStorageConfigured()) {
    void fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    return null;
  }
  if (!IMAGE_CONTENT_TYPES.includes(image.contentType)) {
    void fail(reply, IMAGE_ERRORS.type, 422, { errors: [IMAGE_ERRORS.type] });
    return null;
  }
  if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
    void fail(reply, IMAGE_ERRORS.size, 422, { errors: [IMAGE_ERRORS.size] });
    return null;
  }

  const previousKey = category.imageKey;
  let imageKey: string;
  try {
    imageKey = await uploadAsset(image, {
      folder: `categories/${category.id}`,
      prefix: "image",
      // Category icons sit on coloured surfaces, so transparency is preserved.
      optimizeAs: "category",
    });
  } catch (error) {
    request.log.error({ err: error }, "fallo al subir la imagen de la categoría");
    void fail(reply, "No se pudo guardar la imagen. Inténtalo de nuevo.", 502, {
      error: "storage_unavailable",
    });
    return null;
  }

  const [updated] = await db
    .update(categories)
    .set({ imageKey, updatedAt: new Date() })
    .where(eq(categories.id, category.id))
    .returning();

  await deleteObjectQuietly(previousKey && previousKey !== imageKey ? previousKey : null);
  await refreshProductsCount(category.id);

  return updated!;
}
