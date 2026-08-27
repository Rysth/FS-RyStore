import sharp from "sharp";

/**
 * Image re-encoding on upload, replacing ruby-vips
 * (backend/app/services/attachment_uploader.rb).
 *
 * Every display image becomes WebP, capped at 1600px on its longest side. This
 * is not a nice-to-have: the storefront's whole reason to exist is the product
 * page a buyer opens from a WhatsApp link, usually on mobile data, and a shop
 * owner uploads whatever their phone camera produced. Dropping this step is
 * what would blow the page-weight budget.
 *
 * Videos and payment proofs are stored byte-for-byte — no re-encoding.
 */

export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const VIDEO_CONTENT_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const PAYMENT_PROOF_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, "application/pdf"];

export const MAX_DIMENSION = 1600;
export const QUALITY = 82;

export const OPTIMIZED_CONTENT_TYPE = "image/webp";
export const OPTIMIZED_EXTENSION = ".webp";

export type OptimizedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
};

/**
 * Flattening decides what happens to transparency. Product, gallery and combo
 * photos sit on a white card, so their alpha is composited onto white — WebP
 * with alpha is heavier and the transparency buys nothing there. Category
 * icons and the shop logo are drawn over coloured surfaces and keep it.
 */
export type ImagePurpose = "product" | "gallery" | "promotion" | "category" | "logo";

const FLATTENED_PURPOSES: ImagePurpose[] = ["product", "gallery", "promotion"];

export class ImageProcessingError extends Error {
  constructor(cause?: unknown) {
    super("No se pudo optimizar la imagen. Intenta con otro archivo.");
    this.name = "ImageProcessingError";
    this.cause = cause;
  }
}

export function isOptimizable(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.includes(contentType);
}

/**
 * Downscales to fit MAX_DIMENSION (never upscales), optionally flattens alpha,
 * strips metadata and encodes to WebP.
 */
export async function optimizeImage(
  buffer: Buffer,
  purpose: ImagePurpose,
): Promise<OptimizedImage> {
  try {
    let pipeline = sharp(buffer, { failOn: "error" }).rotate();

    const metadata = await pipeline.metadata();
    const longest = Math.max(metadata.width ?? 0, metadata.height ?? 0);
    if (longest > MAX_DIMENSION) {
      pipeline = pipeline.resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (FLATTENED_PURPOSES.includes(purpose)) {
      pipeline = pipeline.flatten({ background: "#ffffff" });
    }

    const optimized = await pipeline.webp({ quality: QUALITY }).toBuffer();

    return {
      buffer: optimized,
      contentType: OPTIMIZED_CONTENT_TYPE,
      extension: OPTIMIZED_EXTENSION,
    };
  } catch (error) {
    throw new ImageProcessingError(error);
  }
}
