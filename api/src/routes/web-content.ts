import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.ts";
import { branches, downloadableCatalogs } from "../db/schema.ts";
import { PERMISSION_KEYS } from "../db/seed.ts";
import { fail, ok } from "../lib/response.ts";
import { booleanInput, parseOrFail } from "../lib/validation.ts";
import { fileNamed, readMultipart, unwrap } from "../lib/multipart.ts";
import { IMAGE_CONTENT_TYPES } from "../lib/images.ts";
import {
  deleteObjectQuietly,
  isStorageConfigured,
  STORAGE_ERRORS,
  uploadAsset,
} from "../lib/storage.ts";
import { requirePermission } from "../middleware/authorize.ts";
import { getBusiness } from "../services/business.ts";
import {
  findBranch,
  findDownloadableCatalog,
  listBranches,
  listDownloadableCatalogs,
  MAX_BRANCH_NAME_LENGTH,
  MAX_CATALOG_TITLE_LENGTH,
  nextBranchPosition,
  nextDownloadableCatalogPosition,
  reorderBranches,
  reorderDownloadableCatalogs,
  serializeBranch,
  serializeDownloadableCatalog,
  serializeInformationalBusiness,
  updateInformationalBusiness,
} from "../services/web-content.ts";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_CONTENT_TYPES = ["application/pdf", "application/x-pdf"];

const businessInfoSchema = z.object({
  about_title: z.string().trim().max(120, "no puede tener más de 120 caracteres").nullish(),
  about_body: z.string().trim().max(4000, "no puede tener más de 4000 caracteres").nullish(),
  contact_intro: z.string().trim().max(800, "no puede tener más de 800 caracteres").nullish(),
});

const branchSchema = z.object({
  name: z.string().trim().min(1, "es requerido").max(MAX_BRANCH_NAME_LENGTH, `no puede tener más de ${MAX_BRANCH_NAME_LENGTH} caracteres`).optional(),
  address: z.string().trim().max(500, "no puede tener más de 500 caracteres").nullish(),
  hours: z.string().trim().max(300, "no puede tener más de 300 caracteres").nullish(),
  phone: z.string().trim().max(80, "no puede tener más de 80 caracteres").nullish(),
  whatsapp: z.string().trim().max(80, "no puede tener más de 80 caracteres").nullish(),
  maps_url: z.string().trim().url("debe ser una URL válida").or(z.literal("")).nullish(),
  active: booleanInput.optional(),
  position: z.coerce.number().int().min(0).optional(),
});

const downloadableCatalogSchema = z.object({
  title: z.string().trim().min(1, "es requerido").max(MAX_CATALOG_TITLE_LENGTH, `no puede tener más de ${MAX_CATALOG_TITLE_LENGTH} caracteres`).optional(),
  description: z.string().trim().max(500, "no puede tener más de 500 caracteres").nullish(),
  active: booleanInput.optional(),
  position: z.coerce.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  positions: z
    .array(z.object({ id: z.coerce.number().int(), position: z.coerce.number().int().min(0) }))
    .min(1, "No se recibió el nuevo orden"),
});

export async function registerWebContentRoutes(app: FastifyInstance): Promise<void> {
  const canRead = requirePermission(PERMISSION_KEYS.VIEW_CATALOG, PERMISSION_KEYS.MANAGE_CATALOG);
  const canWrite = requirePermission(PERMISSION_KEYS.MANAGE_CATALOG);

  app.get("/api/v1/web-content", { preHandler: canRead }, async (_request, reply) => {
    const [business, branchRows, catalogRows] = await Promise.all([
      getBusiness(),
      listBranches(),
      listDownloadableCatalogs(),
    ]);

    return ok(reply, {
      business: serializeInformationalBusiness(business),
      branches: branchRows.map(serializeBranch),
      downloadable_catalogs: catalogRows.map(serializeDownloadableCatalog),
    });
  });

  app.patch("/api/v1/web-content/business", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(businessInfoSchema, unwrap(request.body, "business"), reply);
    if (!values) return reply;

    const business = await getBusiness();
    const updated = await updateInformationalBusiness(business.id, {
      ...(values.about_title !== undefined ? { aboutTitle: blankToNull(values.about_title) } : {}),
      ...(values.about_body !== undefined ? { aboutBody: blankToNull(values.about_body) } : {}),
      ...(values.contact_intro !== undefined ? { contactIntro: blankToNull(values.contact_intro) } : {}),
    });

    return ok(reply, { business: serializeInformationalBusiness(updated) }, {
      message: "Información web actualizada correctamente",
    });
  });

  app.get("/api/v1/branches", { preHandler: canRead }, async (_request, reply) => {
    return ok(reply, { branches: (await listBranches()).map(serializeBranch) });
  });

  app.put("/api/v1/branches/reorder", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(reorderSchema, request.body, reply);
    if (!values) return reply;

    await reorderBranches(values.positions);
    return ok(reply, { branches: (await listBranches()).map(serializeBranch) }, {
      message: "Orden actualizado correctamente",
    });
  });

  app.post("/api/v1/branches", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(branchSchema, unwrap(request.body, "branch"), reply);
    if (!values) return reply;
    if (!values.name) return fail(reply, "El nombre es requerido", 422, { errors: ["name: es requerido"] });

    const [created] = await db
      .insert(branches)
      .values({
        name: values.name,
        address: blankToNull(values.address),
        hours: blankToNull(values.hours),
        phone: blankToNull(values.phone),
        whatsapp: blankToNull(values.whatsapp),
        mapsUrl: blankToNull(values.maps_url),
        active: values.active ?? true,
        position: values.position && values.position > 0 ? values.position : await nextBranchPosition(),
      })
      .returning();

    return ok(reply, { branch: serializeBranch(created!) }, {
      message: "Sucursal creada correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/branches/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const branch = await findBranch(Number((request.params as { id: string }).id));
        if (!branch) return fail(reply, "Sucursal no encontrada", 404, { error: "not_found" });

        const values = parseOrFail(branchSchema, unwrap(request.body, "branch"), reply);
        if (!values) return reply;

        const [updated] = await db
          .update(branches)
          .set({
            ...(values.name !== undefined ? { name: values.name } : {}),
            ...(values.address !== undefined ? { address: blankToNull(values.address) } : {}),
            ...(values.hours !== undefined ? { hours: blankToNull(values.hours) } : {}),
            ...(values.phone !== undefined ? { phone: blankToNull(values.phone) } : {}),
            ...(values.whatsapp !== undefined ? { whatsapp: blankToNull(values.whatsapp) } : {}),
            ...(values.maps_url !== undefined ? { mapsUrl: blankToNull(values.maps_url) } : {}),
            ...(values.active !== undefined ? { active: values.active } : {}),
            ...(values.position !== undefined ? { position: values.position } : {}),
            updatedAt: new Date(),
          })
          .where(eq(branches.id, branch.id))
          .returning();

        return ok(reply, { branch: serializeBranch(updated!) }, {
          message: "Sucursal actualizada correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/branches/:id", { preHandler: canWrite }, async (request, reply) => {
    const branch = await findBranch(Number((request.params as { id: string }).id));
    if (!branch) return fail(reply, "Sucursal no encontrada", 404, { error: "not_found" });

    await db.delete(branches).where(eq(branches.id, branch.id));
    return ok(reply, {}, { message: "Sucursal eliminada correctamente" });
  });

  app.get("/api/v1/downloadable-catalogs", { preHandler: canRead }, async (_request, reply) => {
    return ok(reply, {
      downloadable_catalogs: (await listDownloadableCatalogs()).map(serializeDownloadableCatalog),
    });
  });

  app.put("/api/v1/downloadable-catalogs/reorder", { preHandler: canWrite }, async (request, reply) => {
    const values = parseOrFail(reorderSchema, request.body, reply);
    if (!values) return reply;

    await reorderDownloadableCatalogs(values.positions);
    return ok(reply, {
      downloadable_catalogs: (await listDownloadableCatalogs()).map(serializeDownloadableCatalog),
    }, {
      message: "Orden actualizado correctamente",
    });
  });

  app.post("/api/v1/downloadable-catalogs", { preHandler: canWrite }, async (request, reply) => {
    const { fields, files } = await readMultipart(request);
    const values = parseOrFail(downloadableCatalogSchema, unwrap(fields, "downloadable_catalog"), reply);
    if (!values) return reply;
    if (!values.title) return fail(reply, "El título es requerido", 422, { errors: ["title: es requerido"] });

    const pdf = fileNamed(files, "file");
    if (!pdf) return fail(reply, "Debes adjuntar un PDF", 422, { errors: ["Debes adjuntar un PDF"] });

    const uploaded = await uploadCatalogFiles(request, reply, files, { requirePdf: true });
    if (!uploaded) return reply;

    const [created] = await db
      .insert(downloadableCatalogs)
      .values({
        title: values.title,
        description: blankToNull(values.description),
        coverImageKey: uploaded.coverImageKey,
        fileKey: uploaded.fileKey!,
        active: values.active ?? true,
        position: values.position && values.position > 0 ? values.position : await nextDownloadableCatalogPosition(),
      })
      .returning();

    return ok(reply, { downloadable_catalog: serializeDownloadableCatalog(created!) }, {
      message: "Catálogo creado correctamente",
      statusCode: 201,
    });
  });

  for (const method of ["PUT", "PATCH"] as const) {
    app.route({
      method,
      url: "/api/v1/downloadable-catalogs/:id",
      preHandler: canWrite,
      async handler(request, reply) {
        const catalog = await findDownloadableCatalog(Number((request.params as { id: string }).id));
        if (!catalog) return fail(reply, "Catálogo no encontrado", 404, { error: "not_found" });

        const { fields, files } = await readMultipart(request);
        const values = parseOrFail(downloadableCatalogSchema, unwrap(fields, "downloadable_catalog"), reply);
        if (!values) return reply;

        const uploaded = await uploadCatalogFiles(request, reply, files, { requirePdf: false });
        if (!uploaded) return reply;

        const [updated] = await db
          .update(downloadableCatalogs)
          .set({
            ...(values.title !== undefined ? { title: values.title } : {}),
            ...(values.description !== undefined ? { description: blankToNull(values.description) } : {}),
            ...(values.active !== undefined ? { active: values.active } : {}),
            ...(values.position !== undefined ? { position: values.position } : {}),
            ...(uploaded.coverImageKey ? { coverImageKey: uploaded.coverImageKey } : {}),
            ...(uploaded.fileKey ? { fileKey: uploaded.fileKey } : {}),
            updatedAt: new Date(),
          })
          .where(eq(downloadableCatalogs.id, catalog.id))
          .returning();

        if (uploaded.coverImageKey) await deleteObjectQuietly(catalog.coverImageKey);
        if (uploaded.fileKey) await deleteObjectQuietly(catalog.fileKey);

        return ok(reply, { downloadable_catalog: serializeDownloadableCatalog(updated!) }, {
          message: "Catálogo actualizado correctamente",
        });
      },
    });
  }

  app.delete("/api/v1/downloadable-catalogs/:id", { preHandler: canWrite }, async (request, reply) => {
    const catalog = await findDownloadableCatalog(Number((request.params as { id: string }).id));
    if (!catalog) return fail(reply, "Catálogo no encontrado", 404, { error: "not_found" });

    await db.delete(downloadableCatalogs).where(eq(downloadableCatalogs.id, catalog.id));
    await deleteObjectQuietly(catalog.coverImageKey);
    await deleteObjectQuietly(catalog.fileKey);

    return ok(reply, {}, { message: "Catálogo eliminado correctamente" });
  });
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function uploadCatalogFiles(
  request: FastifyRequest,
  reply: FastifyReply,
  files: Awaited<ReturnType<typeof readMultipart>>["files"],
  options: { requirePdf: boolean },
): Promise<{ coverImageKey: string | null; fileKey: string | null } | null> {
  const cover = fileNamed(files, "cover_image");
  const pdf = fileNamed(files, "file");
  if (!cover && !pdf) return { coverImageKey: null, fileKey: null };
  if (options.requirePdf && !pdf) {
    void fail(reply, "Debes adjuntar un PDF", 422, { errors: ["Debes adjuntar un PDF"] });
    return null;
  }
  if (!isStorageConfigured()) {
    void fail(reply, STORAGE_ERRORS.unconfigured, 503, { error: "storage_unconfigured" });
    return null;
  }

  if (cover) {
    if (!IMAGE_CONTENT_TYPES.includes(cover.contentType)) {
      void fail(reply, "La portada debe ser formato JPG, PNG o WEBP", 422, {
        errors: ["La portada debe ser formato JPG, PNG o WEBP"],
      });
      return null;
    }
    if (cover.buffer.byteLength > MAX_IMAGE_BYTES) {
      void fail(reply, "La portada debe ser menor a 2MB", 422, {
        errors: ["La portada debe ser menor a 2MB"],
      });
      return null;
    }
  }

  if (pdf) {
    if (!PDF_CONTENT_TYPES.includes(pdf.contentType)) {
      void fail(reply, "El archivo debe ser un PDF", 422, { errors: ["El archivo debe ser un PDF"] });
      return null;
    }
    if (pdf.buffer.byteLength > MAX_PDF_BYTES) {
      void fail(reply, "El PDF debe ser menor a 15MB", 422, { errors: ["El PDF debe ser menor a 15MB"] });
      return null;
    }
  }

  const uploaded: string[] = [];
  try {
    const coverImageKey = cover
      ? await uploadAsset(cover, {
          folder: "downloadable-catalogs/covers",
          prefix: "cover",
          optimizeAs: "promotion",
        })
      : null;
    if (coverImageKey) uploaded.push(coverImageKey);

    const fileKey = pdf
      ? await uploadAsset(pdf, { folder: "downloadable-catalogs/files", prefix: "catalogo" })
      : null;
    if (fileKey) uploaded.push(fileKey);

    return { coverImageKey, fileKey };
  } catch (error) {
    request.log.error({ err: error }, "fallo al subir el catálogo descargable");
    for (const key of uploaded) await deleteObjectQuietly(key);
    void fail(reply, "No se pudo guardar el archivo. Inténtalo de nuevo.", 502, {
      error: "storage_unavailable",
    });
    return null;
  }
}
