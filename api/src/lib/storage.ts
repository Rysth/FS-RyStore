import { randomBytes } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.ts";
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

export function isStorageConfigured(): boolean {
  return Boolean(
    env.CLOUDFLARE_ENDPOINT &&
      env.CLOUDFLARE_ACCESS_KEY_ID &&
      env.CLOUDFLARE_SECRET_ACCESS_KEY &&
      env.CLOUDFLARE_BUCKET_NAME,
  );
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
