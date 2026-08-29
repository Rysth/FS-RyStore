import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env, isProduction } from "../config/env.ts";
import { IMAGE_CONTENT_TYPES, isOptimizable, optimizeImage } from "./images.ts";
import type { ImagePurpose } from "./images.ts";

/**
 * Cloudflare R2 storage, replacing Active Storage plus aws-sdk-s3.
 *
 * Object keys keep the exact layout the Rails service used
 * (`business/{id}/logo_{timestamp}{ext}`, see
 * backend/app/services/cloudflare_business_storage_service.rb), so files
 * already in the bucket stay reachable and nothing is re-uploaded during a
 * migration.
 *
 * Active Storage kept a blobs/attachments table pointing at the object. The key
 * now lives on the row that owns it, which removes two tables and a join.
 */

const ALLOWED_IMAGE_TYPES = IMAGE_CONTENT_TYPES;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const STORAGE_ERRORS = {
  type: "El logo debe ser formato JPG, PNG o WEBP",
  size: "El logo debe ser menor a 2MB",
  unconfigured: "El almacenamiento de archivos no está configurado en este servidor",
} as const;

const LOCAL_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");

export function isCloudflareStorageConfigured(): boolean {
  const values = [
    env.CLOUDFLARE_ENDPOINT,
    env.CLOUDFLARE_ACCESS_KEY_ID,
    env.CLOUDFLARE_SECRET_ACCESS_KEY,
    env.CLOUDFLARE_BUCKET_NAME,
  ];

  if (values.some((value) => !value || value.startsWith("your_") || value.includes("your-account-id"))) {
    return false;
  }

  return Boolean(
    env.CLOUDFLARE_ENDPOINT &&
      env.CLOUDFLARE_ACCESS_KEY_ID &&
      env.CLOUDFLARE_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_BUCKET_NAME,
  );
}

export function useLocalStorage(): boolean {
  return !isProduction && !isCloudflareStorageConfigured();
}

export function isStorageConfigured(): boolean {
  return useLocalStorage() || isCloudflareStorageConfigured();
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: env.CLOUDFLARE_ENDPOINT,
      credentials: {
        accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID!,
        secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export type LogoUpload = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

/** Mirrors the validations Business declared on its attached logo. */
export function validateLogo(upload: LogoUpload): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(upload.contentType)) return STORAGE_ERRORS.type;
  if (upload.buffer.byteLength > MAX_LOGO_BYTES) return STORAGE_ERRORS.size;
  return null;
}

export function buildLogoKey(businessId: number, filename: string): string {
  const extension = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
  return `business/${businessId}/logo_${Math.floor(Date.now() / 1000)}${extension}`;
}

export async function uploadLogo(businessId: number, upload: LogoUpload): Promise<string> {
  const key = buildLogoKey(businessId, upload.filename);

  if (useLocalStorage()) {
    await writeLocalObject(key, upload.buffer);
    return key;
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.CLOUDFLARE_BUCKET_NAME!,
      Key: key,
      Body: upload.buffer,
      ContentType: upload.contentType,
    }),
  );

  return key;
}

export async function deleteObject(key: string): Promise<void> {
  if (useLocalStorage()) {
    await deleteLocalObject(key);
    return;
  }

  await getClient().send(
    new DeleteObjectCommand({ Bucket: env.CLOUDFLARE_BUCKET_NAME!, Key: key }),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Generic assets (catalog images, product video, payment proof)
 * ──────────────────────────────────────────────────────────────────────────── */

export type AssetUpload = {
  buffer: Buffer;
  filename: string;
  contentType: string;
};

export type AssetTarget = {
  /** Key prefix directory, e.g. "products/12" or "orders/340". */
  folder: string;
  /** Filename prefix, e.g. "image", "video", "comprobante". */
  prefix: string;
  /**
   * When set, the file is re-encoded to WebP before upload (see lib/images.ts).
   * Leave it out for videos and payment proofs, which are stored as sent.
   */
  optimizeAs?: ImagePurpose;
};

/**
 * Rails' naming, kept verbatim: `<folder>/<prefix>_<epoch>_<hex4><ext>`.
 * The random suffix is not decoration — a gallery batch uploads several files
 * inside the same second, and without it they collide on the key.
 */
export function buildAssetKey(folder: string, prefix: string, extension: string): string {
  const stamp = Math.floor(Date.now() / 1000);
  return `${folder}/${prefix}_${stamp}_${randomBytes(4).toString("hex")}${extension}`;
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * Uploads one file and returns its object key. Images declared with
 * `optimizeAs` are converted to WebP first, so the stored key ends in .webp
 * regardless of what was uploaded.
 */
export async function uploadAsset(upload: AssetUpload, target: AssetTarget): Promise<string> {
  let body = upload.buffer;
  let contentType = upload.contentType;
  let extension = extensionOf(upload.filename);

  if (target.optimizeAs && isOptimizable(upload.contentType)) {
    const optimized = await optimizeImage(upload.buffer, target.optimizeAs);
    body = optimized.buffer;
    contentType = optimized.contentType;
    extension = optimized.extension;
  }

  const key = buildAssetKey(target.folder, target.prefix, extension);

  if (useLocalStorage()) {
    await writeLocalObject(key, body);
    return key;
  }

  await getClient().send(
    new PutObjectCommand({
      Bucket: env.CLOUDFLARE_BUCKET_NAME!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Best-effort delete for cleanup paths (replacing a photo, purging a rejected
 * upload). The row is already gone or about to be; a failure to remove the
 * object must not turn into a 500 for the shop owner.
 */
export async function deleteObjectQuietly(key: string | null | undefined): Promise<void> {
  if (!key) return;
  try {
    await deleteObject(key);
  } catch {
    // Orphaned object in the bucket; not worth failing the request over.
  }
}

export async function localObjectPath(key: string): Promise<string | null> {
  if (!useLocalStorage()) return null;

  const resolved = path.resolve(LOCAL_UPLOAD_ROOT, key);
  if (!resolved.startsWith(`${LOCAL_UPLOAD_ROOT}${path.sep}`)) return null;

  const info = await stat(resolved).catch(() => null);
  if (!info?.isFile()) return null;

  return resolved;
}

function safeLocalPath(key: string): string {
  const resolved = path.resolve(LOCAL_UPLOAD_ROOT, key);
  if (!resolved.startsWith(`${LOCAL_UPLOAD_ROOT}${path.sep}`)) {
    throw new Error("Ruta de archivo inválida");
  }
  return resolved;
}

async function writeLocalObject(key: string, body: Buffer): Promise<void> {
  const filePath = safeLocalPath(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body);
}

async function deleteLocalObject(key: string): Promise<void> {
  await unlink(safeLocalPath(key));
}

export function streamLocalObject(filePath: string) {
  return createReadStream(filePath);
}
