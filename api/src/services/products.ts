import sanitizeHtml from "sanitize-html";
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import type { Database } from "../db/client.ts";
import { categories, priceTiers, productImages, products, productVariants } from "../db/schema.ts";
import type {
  OptionType,
  PriceTier,
  Product,
  ProductImage,
  ProductVariant,
  VariantOptions,
} from "../db/schema.ts";
import { toCents, ZERO } from "../lib/money.ts";
import { assetUrl } from "../lib/serializers.ts";
import { uniqueSlug } from "../lib/slug.ts";
import { totalStock, variantLabel } from "./pricing.ts";
import type { PricedProduct, PricedVariant } from "./pricing.ts";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Port of backend/app/models/product.rb — the validation half.
 *
 * These are pure functions returning Spanish error messages, so they can be
 * unit tested without a database and reused by both create and update. The
 * messages are the ones the shop owner reads in the admin, so they are copied
 * verbatim from Rails rather than reworded.
 */

export const MAX_NAME_LENGTH = 120;
export const MAX_PRICE_TIERS = 8;
export const MAX_OPTION_TYPES = 3;
export const MAX_OPTION_VALUES = 20;
export const MAX_VARIANTS = 100;
export const MAX_DESCRIPTION_HTML = 20_000;
export const MAX_DESCRIPTION_TEXT = 2_000;
export const MAX_SKU_LENGTH = 60;
export const KINDS = ["product", "service"] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Description
 * ──────────────────────────────────────────────────────────────────────────── */

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s", "a",
  "ul", "ol", "li", "h3", "h4", "blockquote",
];

/**
 * The description comes from a rich-text editor in the admin and is rendered as
 * HTML on the storefront, so it is sanitised on the way in rather than escaped
 * on the way out. Script-bearing tags are dropped **with their contents** — the
 * default of unwrapping them would leave the script body as visible text.
 */
export function sanitizeDescription(value: string | null | undefined): string | null {
  if (!value) return null;

  const clean = sanitizeHtml(value, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "title"] },
    nonTextTags: ["script", "style", "iframe", "object", "embed", "template", "textarea", "noscript"],
  });

  return descriptionText(clean) ? clean : null;
}

/** Tags collapse to a space, not to nothing, so "a<br>b" counts as "a b". */
export function descriptionText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/* ────────────────────────────────────────────────────────────────────────────
 * Price tiers
 * ──────────────────────────────────────────────────────────────────────────── */

export type TierInput = { min_quantity?: unknown; unit_price?: unknown };
export type NormalizedTier = { minQuantity: number; unitPrice: string };

/** Drops rows the admin left entirely blank, then sorts by threshold. */
export function normalizeTiers(input: TierInput[]): NormalizedTier[] {
  return input
    .filter((tier) => !(isBlank(tier.min_quantity) && isBlank(tier.unit_price)))
    .map((tier) => ({
      minQuantity: Number(tier.min_quantity),
      unitPrice: String(tier.unit_price ?? ""),
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

export function validateTiers(tiers: NormalizedTier[], listPrice: string): string[] {
  const errors: string[] = [];
  if (tiers.length === 0) return errors;

  if (tiers.length > MAX_PRICE_TIERS) {
    errors.push(`No puedes configurar más de ${MAX_PRICE_TIERS} escalas de precio`);
  }

  const incomplete = tiers.some(
    (tier) => !Number.isFinite(tier.minQuantity) || tier.unitPrice.trim() === "",
  );
  if (incomplete) {
    errors.push("Completa la cantidad mínima y el precio de cada escala");
    return errors;
  }

  if (tiers.some((tier) => tier.minQuantity < 1)) {
    errors.push("La cantidad mínima de cada escala debe ser mayor o igual a 1");
  }
  if (tiers.some((tier) => toCents(tier.unitPrice) < ZERO)) {
    errors.push("El precio de cada escala debe ser mayor o igual a 0");
  }

  const thresholds = tiers.map((tier) => tier.minQuantity);
  if (new Set(thresholds).size !== thresholds.length) {
    errors.push("No puede haber dos escalas con la misma cantidad mínima");
  }

  const list = toCents(listPrice);
  let previous: bigint | null = null;
  for (const tier of tiers) {
    const price = toCents(tier.unitPrice);
    if (price > list) {
      errors.push(
        `El precio desde ${tier.minQuantity} unidades no puede ser mayor al precio de venta`,
      );
    }
    // The ladder has to fall strictly, or a bigger order could cost more.
    if (previous !== null && price >= previous) {
      errors.push(
        `El precio desde ${tier.minQuantity} unidades debe ser menor al del tramo anterior`,
      );
    }
    previous = price;
  }

  return errors;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Option types and variants
 * ──────────────────────────────────────────────────────────────────────────── */

export function normalizeOptionTypes(input: unknown): OptionType[] {
  if (!Array.isArray(input)) return [];
  return input.map((axis) => {
    const source = (axis ?? {}) as { name?: unknown; values?: unknown };
    return {
      name: String(source.name ?? "").trim(),
      values: Array.isArray(source.values)
        ? source.values.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [],
    };
  });
}

export function validateOptionTypes(axes: OptionType[]): string[] {
  const errors: string[] = [];
  if (axes.length === 0) return errors;

  if (axes.length > MAX_OPTION_TYPES) {
    errors.push(`No puedes configurar más de ${MAX_OPTION_TYPES} tipos de opción`);
  }

  if (axes.some((axis) => !axis.name)) {
    errors.push("Cada tipo de opción necesita un nombre");
  }

  const names = axes.map((axis) => axis.name.toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) {
    errors.push("No puede haber dos tipos de opción con el mismo nombre");
  }

  for (const axis of axes) {
    if (!axis.name) continue;
    if (axis.values.length === 0) {
      errors.push(`${axis.name} necesita al menos un valor`);
    }
    if (axis.values.length > MAX_OPTION_VALUES) {
      errors.push(`${axis.name} no puede tener más de ${MAX_OPTION_VALUES} valores`);
    }
    const lowered = axis.values.map((value) => value.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      errors.push(`${axis.name} tiene valores repetidos`);
    }
  }

  return errors;
}

export type VariantInput = {
  options?: unknown;
  sku?: unknown;
  price?: unknown;
  stock?: unknown;
};

export type NormalizedVariant = {
  options: VariantOptions;
  sku: string | null;
  price: string | null;
  stock: number | null;
  position: number;
};

/**
 * Blank price and stock survive as NULL, never as 0 — "no lo llevo" and "se
 * agotó" are different answers and the storefront treats them differently.
 */
export function normalizeVariants(input: VariantInput[]): NormalizedVariant[] {
  return input.map((variant, index) => {
    const options: VariantOptions = {};
    const source = (variant.options ?? {}) as Record<string, unknown>;
    for (const [axis, value] of Object.entries(source)) {
      options[String(axis).trim()] = String(value ?? "").trim();
    }

    return {
      options,
      sku: isBlank(variant.sku) ? null : String(variant.sku).trim(),
      price: isBlank(variant.price) ? null : String(variant.price),
      stock: isBlank(variant.stock) ? null : Number(variant.stock),
      position: index,
    };
  });
}

/** Order-independent identity of a combination — the key variants match on. */
export function optionsKey(options: VariantOptions): string {
  return Object.keys(options)
    .sort()
    .map((axis) => `${axis}=${options[axis]}`)
    .join("|");
}

export function validateVariants(variants: NormalizedVariant[], axes: OptionType[]): string[] {
  const errors: string[] = [];
  if (variants.length === 0) return errors;

  if (axes.length === 0) {
    errors.push("Un producto sin tipos de opción no puede tener variantes");
    return errors;
  }

  if (variants.length > MAX_VARIANTS) {
    errors.push(`Un producto no puede tener más de ${MAX_VARIANTS} variantes`);
  }

  const keys = variants.map((variant) => optionsKey(variant.options));
  if (new Set(keys).size !== keys.length) {
    errors.push("Hay dos variantes con la misma combinación");
  }

  const axisNames = axes.map((axis) => axis.name);
  for (const variant of variants) {
    const provided = Object.keys(variant.options).sort();
    if (provided.join("|") !== [...axisNames].sort().join("|")) {
      errors.push(`La variante debe definir exactamente: ${axisNames.join(", ")}`);
      continue;
    }

    for (const axis of axes) {
      const value = variant.options[axis.name];
      if (value !== undefined && !axis.values.includes(value)) {
        errors.push(`"${value}" no es un valor válido de ${axis.name}`);
      }
    }

    if (variant.price !== null && toCents(variant.price) < ZERO) {
      errors.push("El precio de cada variante debe ser mayor o igual a 0");
    }
    if (variant.stock !== null && (!Number.isInteger(variant.stock) || variant.stock < 0)) {
      errors.push("El stock de cada variante debe ser un número entero mayor o igual a 0");
    }
    if (variant.sku && variant.sku.length > MAX_SKU_LENGTH) {
      errors.push(`El SKU no puede tener más de ${MAX_SKU_LENGTH} caracteres`);
    }
  }

  return [...new Set(errors)];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Product-level validation
 * ──────────────────────────────────────────────────────────────────────────── */

export type ProductAttributes = {
  name?: string;
  description?: string | null;
  price?: string;
  compareAtPrice?: string | null;
  stock?: number | null;
  kind?: string;
};

export function validateProduct(attributes: ProductAttributes): string[] {
  const errors: string[] = [];

  if (attributes.name !== undefined) {
    if (!attributes.name.trim()) errors.push("El nombre es requerido");
    else if (attributes.name.length > MAX_NAME_LENGTH) {
      errors.push(`El nombre no puede tener más de ${MAX_NAME_LENGTH} caracteres`);
    }
  }

  if (attributes.price !== undefined && toCents(attributes.price) < ZERO) {
    errors.push("El precio debe ser mayor o igual a 0");
  }

  if (attributes.compareAtPrice) {
    if (toCents(attributes.compareAtPrice) < ZERO) {
      errors.push("El precio de comparación debe ser mayor o igual a 0");
    } else if (
      attributes.price !== undefined &&
      toCents(attributes.compareAtPrice) <= toCents(attributes.price)
    ) {
      errors.push("El precio de comparación debe ser mayor al precio de venta");
    }
  }

  if (attributes.stock !== undefined && attributes.stock !== null) {
    if (!Number.isInteger(attributes.stock) || attributes.stock < 0) {
      errors.push("El stock debe ser un número entero mayor o igual a 0");
    }
  }

  if (attributes.kind !== undefined && !KINDS.includes(attributes.kind as (typeof KINDS)[number])) {
    errors.push("El tipo de producto no es válido");
  }

  if (attributes.description) {
    if (attributes.description.length > MAX_DESCRIPTION_HTML) {
      errors.push("La descripción es demasiado larga");
    }
    if (descriptionText(attributes.description).length > MAX_DESCRIPTION_TEXT) {
      errors.push(`La descripción no puede tener más de ${MAX_DESCRIPTION_TEXT} caracteres`);
    }
  }

  return errors;
}

export async function slugForProduct(name: string, currentId?: number): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(
        currentId
          ? and(eq(products.slug, candidate), ne(products.id, currentId))
          : eq(products.slug, candidate),
      )
      .limit(1);
    return Boolean(row);
  });
}

/** Services carry no inventory; Rails cleared it in a before_validation hook. */
export function stockForKind(kind: string, stock: number | null): number | null {
  return kind === "service" ? null : stock;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Persistence
 * ──────────────────────────────────────────────────────────────────────────── */

export const MAX_IMAGES_PER_PRODUCT = 3;

export type ProductRecord = {
  product: Product;
  categoryName: string | null;
  tiers: PriceTier[];
  variants: ProductVariant[];
  images: ProductImage[];
};

export async function findProduct(id: number): Promise<ProductRecord | null> {
  const [row] = await db
    .select({ product: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.id, id))
    .limit(1);
  if (!row) return null;

  const [records] = await loadChildren([row.product.id]);
  return {
    product: row.product,
    categoryName: row.categoryName,
    ...(records ?? { tiers: [], variants: [], images: [] }),
  };
}

export type ProductFilters = {
  categoryId?: number;
  active?: boolean;
  search?: string;
};

export async function listProducts(
  filters: ProductFilters,
  page: number,
  perPage: number,
): Promise<{ rows: ProductRecord[]; total: number }> {
  const conditions = [];
  if (filters.categoryId !== undefined) conditions.push(eq(products.categoryId, filters.categoryId));
  if (filters.active !== undefined) conditions.push(eq(products.active, filters.active));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      sql`(${products.name} ilike ${term} or ${products.description} ilike ${term})`,
    );
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const rows = await db
    .select({ product: products, categoryName: categories.name })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const children = await loadChildren(rows.map((row) => row.product.id));
  return {
    total: count,
    rows: rows.map((row, index) => ({
      product: row.product,
      categoryName: row.categoryName,
      ...(children[index] ?? { tiers: [], variants: [], images: [] }),
    })),
  };
}

/**
 * Three grouped queries instead of one join, so a product with 8 tiers, 20
 * variants and 3 images does not come back as 480 duplicated rows.
 */
async function loadChildren(
  ids: number[],
): Promise<Array<{ tiers: PriceTier[]; variants: ProductVariant[]; images: ProductImage[] }>> {
  if (ids.length === 0) return [];

  const [tiers, variants, images] = await Promise.all([
    db.select().from(priceTiers).where(inArray(priceTiers.productId, ids)).orderBy(asc(priceTiers.minQuantity)),
    db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, ids))
      .orderBy(asc(productVariants.position), asc(productVariants.id)),
    db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, ids))
      .orderBy(asc(productImages.position), asc(productImages.id)),
  ]);

  return ids.map((id) => ({
    tiers: tiers.filter((row) => row.productId === id),
    variants: variants.filter((row) => row.productId === id),
    images: images.filter((row) => row.productId === id),
  }));
}

/**
 * Replaces the whole ladder. The admin form always submits every tier, so
 * patching row by row would need ids the form does not have.
 */
export async function replaceTiers(
  tx: Transaction,
  productId: number,
  tiers: NormalizedTier[],
): Promise<void> {
  await tx.delete(priceTiers).where(eq(priceTiers.productId, productId));
  if (tiers.length === 0) return;

  await tx.insert(priceTiers).values(
    tiers.map((tier) => ({
      productId,
      minQuantity: tier.minQuantity,
      unitPrice: tier.unitPrice,
    })),
  );
}

/**
 * Replaces the whole matrix, but matches rows to existing records by their
 * **option combination** rather than by id. The admin regenerates the matrix
 * from the axes and has no id for "Talla M / Color Negro", so matching by id
 * would delete and recreate every row on each save — losing the stock the shop
 * typed and orphaning the order_items that point at it.
 */
export async function replaceVariants(
  tx: Transaction,
  productId: number,
  variants: NormalizedVariant[],
): Promise<void> {
  const existing = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  const byKey = new Map(existing.map((row) => [optionsKey(row.options as VariantOptions), row]));
  const keptIds: number[] = [];

  for (const variant of variants) {
    const match = byKey.get(optionsKey(variant.options));
    if (match) {
      keptIds.push(match.id);
      await tx
        .update(productVariants)
        .set({
          options: variant.options,
          sku: variant.sku,
          price: variant.price,
          stock: variant.stock,
          position: variant.position,
          updatedAt: new Date(),
        })
        .where(eq(productVariants.id, match.id));
      continue;
    }

    const [created] = await tx
      .insert(productVariants)
      .values({
        productId,
        options: variant.options,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock,
        position: variant.position,
      })
      .returning({ id: productVariants.id });
    if (created) keptIds.push(created.id);
  }

  // order_items.product_variant_id is ON DELETE SET NULL, so a past order keeps
  // its frozen variant_label even when the combination stops being sold.
  await tx
    .delete(productVariants)
    .where(
      keptIds.length
        ? and(eq(productVariants.productId, productId), notInArray(productVariants.id, keptIds))
        : eq(productVariants.productId, productId),
    );
}

/** Closes gaps so position 0 is always occupied — it is the main photo. */
export async function compactImagePositions(productId: number): Promise<void> {
  const rows = await db
    .select({ id: productImages.id })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.position), asc(productImages.id));

  await db.transaction(async (tx) => {
    for (const [position, row] of rows.entries()) {
      await tx
        .update(productImages)
        .set({ position, updatedAt: new Date() })
        .where(eq(productImages.id, row.id));
    }
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Serialization
 * ──────────────────────────────────────────────────────────────────────────── */

export function serializeProduct(record: ProductRecord) {
  const { product, tiers, variants, images } = record;
  const gallery = galleryUrls(record);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    compare_at_price: product.compareAtPrice,
    category_id: product.categoryId,
    category_name: record.categoryName,
    // `image_url` stays the main photo — the catalog card and the WhatsApp
    // preview read it — and `images` is the whole gallery in order. A client
    // that never learns about galleries still works.
    image_url: gallery[0] ?? "",
    images: images.map((image) => ({
      id: image.id,
      position: image.position,
      url: assetUrl(image.fileKey),
    })),
    video_url: assetUrl(product.videoKey),
    active: product.active,
    kind: product.kind,
    stock: product.stock,
    // Total across the matrix when there is one, so the product list can keep
    // showing a single number per row.
    total_stock: totalStock(toPricedProduct(product), variants.map(toPricedVariant)),
    price_tiers: tiers.map((tier) => ({
      min_quantity: tier.minQuantity,
      unit_price: tier.unitPrice,
    })),
    option_types: product.optionTypes as OptionType[],
    variants: variants.map((variant) => ({
      id: variant.id,
      options: variant.options as VariantOptions,
      label: variantLabel(toPricedProduct(product), variant.options as VariantOptions),
      sku: variant.sku,
      price: variant.price,
      stock: variant.stock,
      position: variant.position,
    })),
    created_at: product.createdAt,
    updated_at: product.updatedAt,
  };
}

/** The gallery wins; the legacy single photo is the fallback. */
export function galleryUrls(record: Pick<ProductRecord, "product" | "images">): string[] {
  if (record.images.length > 0) return record.images.map((image) => assetUrl(image.fileKey));
  return record.product.imageKey ? [assetUrl(record.product.imageKey)] : [];
}

export function toPricedProduct(product: Product): PricedProduct {
  return {
    id: product.id,
    price: product.price,
    kind: product.kind,
    active: product.active,
    stock: product.stock,
    optionTypes: product.optionTypes as OptionType[],
  };
}

export function toPricedVariant(variant: ProductVariant): PricedVariant {
  return {
    id: variant.id,
    productId: variant.productId,
    options: variant.options as VariantOptions,
    price: variant.price,
    stock: variant.stock,
  };
}
