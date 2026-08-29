import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { productImages, products } from "../db/schema.ts";
import type { OptionType } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { fail, ok } from "../lib/response.ts";
import { booleanInput, paginationInput, parseOrFail } from "../lib/validation.ts";
import { fileNamed, readMultipart, truthy, unwrap } from "../lib/multipart.ts";
import { IMAGE_CONTENT_TYPES, VIDEO_CONTENT_TYPES } from "../lib/images.ts";
import {
  deleteObjectQuietly,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadAsset,
} from "../lib/storage.ts";
import { refreshProductsCount } from "../services/categories.ts";
import {
  existingBranchIds,
  replaceProductBranches,
} from "../services/web-content.ts";
import {
  compactImagePositions,
  findProduct,
  listProducts,
  MAX_IMAGES_PER_PRODUCT,
  normalizeOptionTypes,
  normalizeTiers,
  normalizeVariants,
  replaceTiers,
  replaceVariants,
  sanitizeDescription,
  serializeProduct,
  slugForProduct,
  stockForKind,
  validateOptionTypes,
  validateProduct,
  validateTiers,
  validateVariants,
  normalizeDefaultIngredients,
  validateDefaultIngredients,
} from "../services/products.ts";
import type { ProductRecord } from "../services/products.ts";

/** Port of Api::V1::ProductsController. */

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

const IMAGE_ERRORS = {
  missing: "Debes adjuntar una imagen",
  type: "La imagen debe ser formato JPG, PNG o WEBP",
  size: "La imagen debe ser menor a 2MB",
  batch: "Cada imagen debe ser JPG, PNG o WEBP y menor a 2MB",
} as const;

const VIDEO_ERRORS = {
  missing: "Debes adjuntar un video",
  type: "El video debe ser MP4, WEBM o MOV",
  size: `El video debe pesar menos de ${MAX_VIDEO_BYTES / (1024 * 1024)}MB`,
} as const;

const listQuerySchema = paginationInput.extend({
  category_id: z.coerce.number().int().optional(),
  active: z.string().optional(),
  search: z.string().trim().min(1).optional(),
});

// Deliberately permissive on the nested arrays: their rules live in
// services/products.ts as pure functions, so both create and update run the
// exact same checks and can report every problem in one 422.
const productSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullish(),
  price: z.union([z.string(), z.number()]).optional(),
  compare_at_price: z.union([z.string(), z.number()]).nullish(),
  category_id: z.coerce.number().int().nullish(),
  active: booleanInput.optional(),
  stock: z.coerce.number().int().nullish(),
  kind: z.string().optional(),
  price_tiers: z.array(z.record(z.unknown())).optional(),
  option_types: z.array(z.record(z.unknown())).optional(),
  default_ingredients: z.array(z.string()).optional(),
  variants: z.array(z.record(z.unknown())).optional(),
  branch_ids: z.array(z.coerce.number().int()).optional(),
});

const reorderImagesSchema = z.object({
  image_ids: z.array(z.coerce.number().int()).min(1, "es requerido"),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.coerce.number().int()).min(1, "es requerido"),
  category_id: z.coerce.number().int().nullish(),
  active: booleanInput.optional(),
});

function normalizeBranchIds(ids: number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

async function allBranchesExist(ids: number[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return (await existingBranchIds(ids)).length === ids.length;
}

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_CATALOG, PERMISSION_KEYS.MANAGE_CATALOG);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_CATALOG);

  app.get("/api/v1/products", { preHandler: canRead }, async (request, reply) => {
    const query = parseOrFail(listQuerySchema, request.query, reply);
    if (!query) return reply;

    const { rows, total } = await listProducts(
      {
        ...(query.category_id !== undefined ? { categoryId: query.category_id } : {}),
        ...(query.active !== undefined ? { active: query.active === "true" } : {}),
        ...(query.search ? { search: query.search } : {}),
      },
      query.page,
      query.per_page,
    );

    return ok(reply, {
      products: rows.map(serializeProduct),
      pagination: {
        current_page: query.page,
        total_pages: Math.max(1, Math.ceil(total / query.per_page)),
        total_count: total,
        per_page: query.per_page,
      },
    });
  });

  app.get("/api/v1/products/:id", { preHandler: canRead }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;
    return ok(reply, { product: serializeProduct(record) });
  });

  app.post("/api/v1/products", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(productSchema, unwrap(request.body, "product"), reply);
    if (!values) return reply;

    const name = (values.name ?? "").trim();
    const price = String(values.price ?? "0");
    const kind = values.kind ?? "product";
    const description = sanitizeDescription(values.description);
    const optionTypes = normalizeOptionTypes(values.option_types ?? []);
    const tiers = normalizeTiers(values.price_tiers ?? []);
    const variants = normalizeVariants(values.variants ?? []);
    const branchIds = normalizeBranchIds(values.branch_ids ?? []);
    const defaultIngredients = normalizeDefaultIngredients(values.default_ingredients ?? []);

    const errors = [
      ...validateProduct({
        name,
        description,
        price,
        compareAtPrice: values.compare_at_price == null ? null : String(values.compare_at_price),
        stock: values.stock ?? null,
        kind,
      }),
      ...validateTiers(tiers, price),
      ...validateOptionTypes(optionTypes),
      ...validateDefaultIngredients(defaultIngredients),
      ...validateVariants(variants, optionTypes),
    ];
    if (errors.length > 0) {
      return fail(reply, "No se pudo crear el producto", 422, { errors });
    }
    if (!(await allBranchesExist(branchIds))) {
      return fail(reply, "No se pudo crear el producto", 422, {
        errors: ["Una de las sucursales seleccionadas no existe"],
      });
    }

    const productId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(products)
        .values({
          name,
          slug: await slugForProduct(name),
          description,
          price,
          compareAtPrice: values.compare_at_price == null ? null : String(values.compare_at_price),
          categoryId: values.category_id ?? null,
          active: values.active ?? true,
          stock: stockForKind(kind, values.stock ?? null),
          optionTypes,
          defaultIngredients,
          kind,
        })
        .returning({ id: products.id });

      await replaceTiers(tx, created!.id, tiers);
      await replaceVariants(tx, created!.id, variants);
      await replaceProductBranches(tx, created!.id, branchIds);
      return created!.id;
    });

    await refreshProductsCount(values.category_id ?? null);

    return ok(reply, { product: serializeProduct((await findProduct(productId))!) }, {
      message: "Producto creado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/products/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const record = await loadOrFail(request.params, reply);
        if (!record) return reply;

        const values = parseOrFail(productSchema, unwrap(request.body, "product"), reply);
        if (!values) return reply;

        const current = record.product;
        const name = values.name === undefined ? current.name : values.name.trim();
        const price = values.price === undefined ? current.price : String(values.price);
        const kind = values.kind ?? current.kind;
        const compareAtPrice =
          values.compare_at_price === undefined
            ? current.compareAtPrice
            : values.compare_at_price == null
            ? null
            : String(values.compare_at_price);
        const stock = values.stock === undefined ? current.stock : values.stock;
        const description =
          values.description === undefined ? current.description : sanitizeDescription(values.description);

        // An absent key leaves the stored set alone; an empty array clears it.
        const optionTypes =
          values.option_types === undefined
            ? (current.optionTypes as OptionType[])
            : normalizeOptionTypes(values.option_types);
        const tiers = values.price_tiers === undefined ? null : normalizeTiers(values.price_tiers);
        const defaultIngredients = values.default_ingredients === undefined
          ? (current.defaultIngredients as string[])
          : normalizeDefaultIngredients(values.default_ingredients);
        // Clearing the axes clears the matrix with them: a variant with no axis
        // to belong to could never be selected again.
        const variants =
          optionTypes.length === 0
            ? []
            : values.variants === undefined
            ? null
            : normalizeVariants(values.variants);
        const branchIds = values.branch_ids === undefined ? null : normalizeBranchIds(values.branch_ids);

        const storedVariants = record.variants.map((variant) => ({
          options: variant.options as Record<string, string>,
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock,
          position: variant.position,
        }));

        const errors = [
          ...validateProduct({ name, description, price, compareAtPrice, stock, kind }),
          ...validateTiers(tiers ?? [], price),
          ...validateOptionTypes(optionTypes),
          ...validateDefaultIngredients(defaultIngredients),
          ...validateVariants(variants ?? storedVariants, optionTypes),
        ];
        if (errors.length > 0) {
          return fail(reply, "No se pudo actualizar el producto", 422, { errors });
        }
        if (branchIds !== null && !(await allBranchesExist(branchIds))) {
          return fail(reply, "No se pudo actualizar el producto", 422, {
            errors: ["Una de las sucursales seleccionadas no existe"],
          });
        }

        await db.transaction(async (tx) => {
          await tx
            .update(products)
            .set({
              name,
              ...(values.name !== undefined && name !== current.name
                ? { slug: await slugForProduct(name, current.id) }
                : {}),
              description,
              price,
              compareAtPrice,
              ...(values.category_id !== undefined ? { categoryId: values.category_id } : {}),
              ...(values.active !== undefined ? { active: values.active } : {}),
              stock: stockForKind(kind, stock),
              optionTypes,
              defaultIngredients,
              kind,
              updatedAt: new Date(),
            })
            .where(eq(products.id, current.id));

          if (tiers !== null) await replaceTiers(tx, current.id, tiers);
          if (variants !== null) await replaceVariants(tx, current.id, variants);
          if (branchIds !== null) await replaceProductBranches(tx, current.id, branchIds);
        });

        await refreshProductsCount(current.categoryId);
        if (values.category_id !== undefined) await refreshProductsCount(values.category_id);

        return ok(reply, { product: serializeProduct((await findProduct(current.id))!) }, {
          message: "Producto actualizado correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/products/:id", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    // Tiers, variants and gallery rows go with it (ON DELETE CASCADE);
    // order_items keep their frozen copy (ON DELETE SET NULL).
    await db.delete(products).where(eq(products.id, record.product.id));

    for (const key of [
      record.product.imageKey,
      record.product.videoKey,
      ...record.images.map((image) => image.fileKey),
    ]) {
      await deleteObjectQuietly(key);
    }
    await refreshProductsCount(record.product.categoryId);

    return ok(reply, {}, { message: "Producto eliminado correctamente" });
  });

  app.patch("/api/v1/products/bulk", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(bulkUpdateSchema, request.body, reply);
    if (!values) return reply;

    const affected = await db
      .select({ id: products.id, categoryId: products.categoryId })
      .from(products)
      .where(inArray(products.id, values.ids));

    if (affected.length === 0) {
      return fail(reply, "Ningún producto encontrado", 404, { error: "not_found" });
    }

    const oldCategoryIds = new Set(
      affected.map((p) => p.categoryId).filter((id): id is number => id !== null),
    );

    const setClause: Record<string, unknown> = { updatedAt: new Date() };
    if (values.category_id !== undefined) setClause.categoryId = values.category_id;
    if (values.active !== undefined) setClause.active = values.active;

    await db
      .update(products)
      .set(setClause)
      .where(inArray(products.id, values.ids));

    for (const categoryId of oldCategoryIds) {
      await refreshProductsCount(categoryId);
    }
    if (values.category_id !== undefined && values.category_id !== null) {
      await refreshProductsCount(values.category_id);
    }

    return ok(reply, {}, {
      message: `${affected.length} producto(s) actualizado(s) correctamente`,
    });
  });

  /* ── Media ─────────────────────────────────────────────────────────────── */

  // POST /api/v1/products/:id/image — the legacy single photo.
  app.post("/api/v1/products/:id/image", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const { files } = await readMultipart(request);
    const image = fileNamed(files, "image");
    if (!image) return fail(reply, IMAGE_ERRORS.missing, 422, { errors: [IMAGE_ERRORS.missing] });

    if (!isStorageConfigured()) {
      return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    }
    // Checked before uploading, not after: replacing the object first would
    // cost the shop the photo it had over a file that was never accepted.
    if (image.buffer.byteLength > MAX_IMAGE_BYTES) {
      return fail(reply, IMAGE_ERRORS.size, 422, { errors: [IMAGE_ERRORS.size] });
    }
    if (!IMAGE_CONTENT_TYPES.includes(image.contentType)) {
      return fail(reply, IMAGE_ERRORS.type, 422, { errors: [IMAGE_ERRORS.type] });
    }

    let imageKey: string;
    try {
      imageKey = await uploadAsset(image, {
        folder: `products/${record.product.id}`,
        prefix: "image",
        optimizeAs: "product",
      });
    } catch (error) {
      request.log.error({ err: error }, "fallo al subir la imagen del producto");
      return fail(reply, "No se pudo guardar la imagen. Inténtalo de nuevo.", 502, {
        error: "storage_unavailable",
      });
    }

    await db
      .update(products)
      .set({ imageKey, updatedAt: new Date() })
      .where(eq(products.id, record.product.id));
    await deleteObjectQuietly(record.product.imageKey);

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Imagen actualizada correctamente",
    });
  });

  app.delete("/api/v1/products/:id/image", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    await db
      .update(products)
      .set({ imageKey: null, updatedAt: new Date() })
      .where(eq(products.id, record.product.id));
    await deleteObjectQuietly(record.product.imageKey);

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Imagen eliminada correctamente",
    });
  });

  // POST /api/v1/products/:id/images — appends to the gallery. Several files at
  // once, because a shop photographing a product does it in one sitting.
  app.post("/api/v1/products/:id/images", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const { files } = await readMultipart(request);
    const batch = files.filter((file) => file.fieldname.startsWith("images") && file.buffer.byteLength > 0);
    if (batch.length === 0) {
      const message = "Debes adjuntar al menos una imagen";
      return fail(reply, message, 422, { errors: [message] });
    }

    if (!isStorageConfigured()) {
      return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    }

    const room = MAX_IMAGES_PER_PRODUCT - record.images.length;
    if (batch.length > room) {
      const message =
        `Un producto no puede tener más de ${MAX_IMAGES_PER_PRODUCT} imágenes` +
        (room > 0 ? ` (te quedan ${room})` : "");
      return fail(reply, message, 422, { errors: [message] });
    }

    // Every file is checked before any of them is uploaded: a rejection halfway
    // through the batch would otherwise leave the gallery half-updated.
    const invalid = batch.some(
      (file) =>
        file.buffer.byteLength > MAX_IMAGE_BYTES || !IMAGE_CONTENT_TYPES.includes(file.contentType),
    );
    if (invalid) return fail(reply, IMAGE_ERRORS.batch, 422, { errors: [IMAGE_ERRORS.batch] });

    const [{ next = 0 } = {}] = await db
      .select({ next: sql<number>`coalesce(max(${productImages.position}) + 1, 0)::int` })
      .from(productImages)
      .where(eq(productImages.productId, record.product.id));

    const uploaded: string[] = [];
    try {
      for (const file of batch) {
        uploaded.push(
          await uploadAsset(file, {
            folder: `products/${record.product.id}/gallery`,
            prefix: "image",
            optimizeAs: "gallery",
          }),
        );
      }
    } catch (error) {
      request.log.error({ err: error }, "fallo al subir la galería del producto");
      for (const key of uploaded) await deleteObjectQuietly(key);
      return fail(reply, "No se pudieron guardar las imágenes. Inténtalo de nuevo.", 502, {
        error: "storage_unavailable",
      });
    }

    await db.insert(productImages).values(
      uploaded.map((fileKey, offset) => ({
        productId: record.product.id,
        fileKey,
        position: next + offset,
      })),
    );

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Imágenes agregadas correctamente",
    });
  });

  // PUT /api/v1/products/:id/images/reorder — body { image_ids: [3, 1, 2] }.
  // Ids, not positions: the client already knows the order it wants, and
  // sending the whole set means a reorder cannot land half-applied.
  app.put("/api/v1/products/:id/images/reorder", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const values = parseOrFail(reorderImagesSchema, request.body, reply);
    if (!values) return reply;

    const requested = [...new Set(values.image_ids.filter((id) => id !== 0))].sort((a, b) => a - b);
    const owned = record.images.map((image) => image.id).sort((a, b) => a - b);
    if (requested.join(",") !== owned.join(",")) {
      const message = "El nuevo orden no coincide con las imágenes del producto";
      return fail(reply, message, 422, { errors: [message] });
    }

    await db.transaction(async (tx) => {
      for (const [position, id] of values.image_ids.entries()) {
        await tx
          .update(productImages)
          .set({ position, updatedAt: new Date() })
          .where(and(eq(productImages.id, id), eq(productImages.productId, record.product.id)));
      }
    });

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Orden actualizado correctamente",
    });
  });

  app.delete("/api/v1/products/:id/images/:image_id", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const imageId = Number((request.params as { image_id: string }).image_id);
    const image = record.images.find((row) => row.id === imageId);
    if (!image) return fail(reply, "Imagen no encontrada", 404, { error: "not_found" });

    await db.delete(productImages).where(eq(productImages.id, image.id));
    await deleteObjectQuietly(image.fileKey);
    // Closing the gap keeps position 0 occupied, so deleting the main photo
    // promotes the next one instead of leaving the product without one.
    await compactImagePositions(record.product.id);

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Imagen eliminada correctamente",
    });
  });

  // POST /api/v1/products/:id/video — one clip per product, so this replaces.
  app.post("/api/v1/products/:id/video", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    const { files } = await readMultipart(request);
    const video = fileNamed(files, "video");
    if (!video) return fail(reply, VIDEO_ERRORS.missing, 422, { errors: [VIDEO_ERRORS.missing] });

    if (!isStorageConfigured()) {
      return fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    }
    if (video.buffer.byteLength > MAX_VIDEO_BYTES) {
      return fail(reply, VIDEO_ERRORS.size, 422, { errors: [VIDEO_ERRORS.size] });
    }
    if (!VIDEO_CONTENT_TYPES.includes(video.contentType)) {
      return fail(reply, VIDEO_ERRORS.type, 422, { errors: [VIDEO_ERRORS.type] });
    }

    // Duration is not checked: reading it needs ffprobe, which this image does
    // not ship. The admin reads it off the file before uploading, and the size
    // cap above is what bounds a clip that gets past the browser.
    let videoKey: string;
    try {
      videoKey = await uploadAsset(video, {
        folder: `products/${record.product.id}`,
        prefix: "video",
      });
    } catch (error) {
      request.log.error({ err: error }, "fallo al subir el video del producto");
      return fail(reply, "No se pudo guardar el video. Inténtalo de nuevo.", 502, {
        error: "storage_unavailable",
      });
    }

    await db
      .update(products)
      .set({ videoKey, updatedAt: new Date() })
      .where(eq(products.id, record.product.id));
    await deleteObjectQuietly(record.product.videoKey);

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Video actualizado correctamente",
    });
  });

  app.delete("/api/v1/products/:id/video", { preHandler: canWrite }, async (request, reply) => {
    const record = await loadOrFail(request.params, reply);
    if (!record) return reply;

    await db
      .update(products)
      .set({ videoKey: null, updatedAt: new Date() })
      .where(eq(products.id, record.product.id));
    await deleteObjectQuietly(record.product.videoKey);

    return ok(reply, { product: serializeProduct((await findProduct(record.product.id))!) }, {
      message: "Video eliminado correctamente",
    });
  });

  await Promise.resolve();
}

/** Answers 404 itself and returns null, mirroring Rails' set_product. */
async function loadOrFail(params: unknown, reply: FastifyReply): Promise<ProductRecord | null> {
  const id = Number((params as { id: string }).id);
  const record = Number.isInteger(id) ? await findProduct(id) : null;
  if (!record) {
    void fail(reply, "Producto no encontrado", 404, { error: "not_found" });
    return null;
  }
  return record;
}
