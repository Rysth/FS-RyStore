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

    assignField(fields, part.fieldname, part.value);
  }

  return { fields, files };
}

/**
 * Expands Rails' bracket notation, which is what the admin's FormData sends:
 * `category[name]` becomes `{ category: { name } }` and a repeated `images[]`
 * becomes an array. Rack did this for free; here it has to be explicit, and
 * without it `unwrap(fields, "category")` finds nothing and every multipart
 * save fails with "El nombre es requerido".
 */
export function assignField(target: Record<string, unknown>, name: string, value: unknown): void {
  const match = /^([^[\]]+)((?:\[[^[\]]*\])+)$/.exec(name);

  if (!match) {
    append(target, name, value);
    return;
  }

  const [, root, rest] = match;
  const keys = [...rest!.matchAll(/\[([^[\]]*)\]/g)].map((entry) => entry[1]!);

  let container = target;
  let key = root!;

  for (const next of keys) {
    // A trailing `[]` means "collect", so the current key holds an array.
    if (next === "") {
      append(container, key, value);
      return;
    }
    const existing = container[key];
    const nested =
      existing && typeof existing === "object" && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    container[key] = nested;
    container = nested;
    key = next;
  }

  append(container, key, value);
}

/** A repeated field collapses into an array rather than the last value winning. */
function append(target: Record<string, unknown>, key: string, value: unknown): void {
  const existing = target[key];
  if (existing === undefined) {
    target[key] = value;
  } else if (Array.isArray(existing)) {
    existing.push(value);
  } else {
    target[key] = [existing, value];
  }
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
