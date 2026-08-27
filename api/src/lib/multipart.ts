import type { FastifyRequest } from "fastify";

/**
 * Unpacks a request that may arrive as JSON or as multipart.
 *
 * The admin sends plain JSON when there is no file and multipart when there is,
 * for the same endpoint — Rails handled both transparently and the frontend
 * relies on it. Multipart values always arrive as strings, so the Zod schemas
 * downstream use `coerce` where a number or boolean is expected.
 */

export type UploadedFile = {
  fieldname: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export type MultipartPayload = {
  fields: Record<string, unknown>;
  files: UploadedFile[];
};

export async function readMultipart(request: FastifyRequest): Promise<MultipartPayload> {
  if (!request.isMultipart()) {
    return { fields: (request.body ?? {}) as Record<string, unknown>, files: [] };
  }

  const fields: Record<string, unknown> = {};
  const files: UploadedFile[] = [];

  for await (const part of request.parts()) {
    if (part.type === "file") {
      files.push({
        fieldname: part.fieldname,
        buffer: await part.toBuffer(),
        filename: part.filename,
        contentType: part.mimetype,
      });
      continue;
    }

    // A repeated field (`images[]`) collapses into an array rather than the
    // last value winning.
    const existing = fields[part.fieldname];
    if (existing === undefined) {
      fields[part.fieldname] = part.value;
    } else if (Array.isArray(existing)) {
      existing.push(part.value);
    } else {
      fields[part.fieldname] = [existing, part.value];
    }
  }

  return { fields, files };
}

export function fileNamed(files: UploadedFile[], fieldname: string): UploadedFile | null {
  return files.find((file) => file.fieldname === fieldname) ?? null;
}

/**
 * Rails wrapped resource params (`{ category: { name: … } }`) and the admin
 * still sends that shape from some stores. Accept both.
 */
export function unwrap(body: unknown, key: string): Record<string, unknown> {
  const source = (body ?? {}) as Record<string, unknown>;
  const nested = source[key];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return source;
}

/** Multipart sends "true"/"false"; JSON sends real booleans. */
export function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}
