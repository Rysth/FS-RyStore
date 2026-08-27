import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.ts";

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

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
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
