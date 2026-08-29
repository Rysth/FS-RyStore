import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { categories, priceTiers, productImages, products, productVariants } from "../db/schema.ts";
import type { Business, OptionType, VariantOptions } from "../db/schema.ts";
import { fromCents } from "../lib/money.ts";
import { assetUrl } from "../lib/serializers.ts";
import {
  availableUnits,
  comboAvailable,
  discountPercent,
  regularTotal,
  savings,
  unitPriceForVariant,
  variantLabel,
} from "./pricing.ts";
import { comboItems, listPromotions, promotionImageUrl } from "./promotions.ts";
import { galleryUrls, toPricedProduct, toPricedVariant } from "./products.ts";
import type { ProductRecord } from "./products.ts";
import { loadProductBranches, publicBranchJson } from "./web-content.ts";

/**
 * Port of Api::V1::Public::* — everything the Astro storefront reads.
 *
 * The product shape lives here in one copy, shared by the catalog, the product
 * page and the products inside a combo: a field added for one of them must not
 * go missing in another.
 */

export const PUBLIC_SORTS = ["precio_asc", "precio_desc", "vendidos"] as const;
export type PublicSort = (typeof PUBLIC_SORTS)[number];

/* ────────────────────────────────────────────────────────────────────────────
 * Store settings
 * ──────────────────────────────────────────────────────────────────────────── */

export function serializeStore(business: Business) {
  return {
    name: business.name?.trim() ? business.name : "RyStore",
    slogan: business.slogan?.trim()
      ? business.slogan
      : "Tu tienda online simple con pedidos por WhatsApp",
    logo_url: assetUrl(business.logoKey),
    whatsapp: business.whatsapp,
    instagram: business.instagram,
    facebook: business.facebook,
    tiktok: business.tiktok,
    address: business.address,
    maps_url: business.mapsUrl,
    about_title: business.aboutTitle,
    about_body: business.aboutBody,
    contact_intro: business.contactIntro,
    delivery_notes: business.deliveryNotes,
    bank_instructions: business.bankInstructions,
    primary_color: business.primaryColor,
    // The storefront reads this to choose between the catalog and its "closed"
    // page. Safe to expose: it says nothing a buyer looking at a closed shop
    // cannot already tell.
    published: business.published,
    // notification_email is deliberately absent — it is the owner's inbox and
    // this payload is read straight by the buyer's browser.
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Categories
 * ──────────────────────────────────────────────────────────────────────────── */

export async function publicCategories() {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.active, true))
    .orderBy(asc(categories.position), asc(categories.name));

  return rows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    image_url: assetUrl(category.imageKey),
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Products
 * ──────────────────────────────────────────────────────────────────────────── */

export type CatalogFilters = {
  categorySlug?: string;
  search?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
};

export const EMPTY_PAGINATION = {
  current_page: 1,
  total_pages: 0,
  total_count: 0,
  per_page: 12,
} as const;

/**
 * Junk in the query string resolves to "no filter" rather than a 500 — these
 * params arrive from a URL anyone can edit. Negatives are dropped too.
 */
export function decimalParam(raw: unknown): string | null {
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return String(raw).trim();
}

export async function publicProducts(
  filters: CatalogFilters,
  page: number,
  perPage: number,
): Promise<{ rows: ProductRecord[]; total: number } | null> {
  const conditions = [eq(products.active, true)];

  if (filters.categorySlug) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.slug, filters.categorySlug), eq(categories.active, true)))
      .limit(1);
    // A slug that names nothing is an empty catalog, not a 404: the storefront
    // renders "no encontramos productos" with its filters still on screen.
    if (!category) return null;
    conditions.push(eq(products.categoryId, category.id));
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(sql`(${products.name} ilike ${term} or ${products.description} ilike ${term})`);
  }

  // Filtered on the list price, not on the wholesale tiers: the buyer filters
  // by what the card shows them, and a product whose 12-unit price falls in
  // range while its list price does not would look like a mistake.
  let min = decimalParam(filters.minPrice);
  let max = decimalParam(filters.maxPrice);
  // Swapped bounds are a slider dragged past itself, not an empty page.
  if (min !== null && max !== null && Number(min) > Number(max)) [min, max] = [max, min];
  if (min !== null) conditions.push(sql`${products.price} >= ${min}`);
  if (max !== null) conditions.push(sql`${products.price} <= ${max}`);

  const where = and(...conditions);

  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(where);

  const rows = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(...sortClause(filters.sort))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return { total: count, rows: await hydrate(rows) };
}

/** An unrecognised value falls back to newest-first; the whitelist is what keeps this safe. */
function sortClause(sort: string | undefined) {
  switch (sort) {
    case "precio_asc":
      return [asc(products.price), desc(products.id)];
    case "precio_desc":
      return [desc(products.price), desc(products.id)];
    case "vendidos":
      // A correlated subquery rather than a GROUP BY: grouping would make the
      // count query return one row per product instead of a total.
      return [
        desc(
          sql`(select coalesce(sum(oi.quantity), 0) from order_items oi where oi.product_id = ${products.id})`,
        ),
        desc(products.id),
      ];
    default:
      return [desc(products.createdAt), desc(products.id)];
  }
}

export async function publicProductBySlug(slug: string): Promise<ProductRecord | null> {
  const [row] = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(eq(products.slug, slug), eq(products.active, true)))
    .limit(1);
  if (!row) return null;

  const [record] = await hydrate([row]);
  return record ?? null;
}

export async function relatedProducts(record: ProductRecord, limit = 4): Promise<ProductRecord[]> {
  if (record.product.categoryId === null) return [];

  const rows = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.active, true),
        eq(products.categoryId, record.product.categoryId),
        ne(products.id, record.product.id),
      ),
    )
    .limit(limit);

  return hydrate(rows);
}

type CatalogRow = {
  product: typeof products.$inferSelect;
  categoryName: string | null;
  categorySlug: string | null;
};

/** Three grouped queries, so N products never cost 3N round trips. */
export async function hydrate(rows: CatalogRow[]): Promise<ProductRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.product.id);

  const [tiers, variants, images, branchMap] = await Promise.all([
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
    loadProductBranches(ids),
  ]);

  return rows.map((row) => ({
    product: row.product,
    categoryName: row.categoryName,
    categorySlug: row.categorySlug,
    tiers: tiers.filter((tier) => tier.productId === row.product.id),
    variants: variants.filter((variant) => variant.productId === row.product.id),
    images: images.filter((image) => image.productId === row.product.id),
    branches: (branchMap.get(row.product.id) ?? []).filter((branch) => branch.active),
  }));
}

/** The storefront's product shape. Shared by the catalog, the page and combos. */
export function publicProductJson(record: ProductRecord) {
  const { product, tiers, variants } = record;
  const gallery = galleryUrls(record);
  const priced = toPricedProduct(product);
  const tierRows = tiers.map((tier) => ({ minQuantity: tier.minQuantity, unitPrice: tier.unitPrice }));

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    compare_at_price: product.compareAtPrice,
    kind: product.kind,
    // The main photo, kept as its own field because og:image and the JSON-LD
    // need exactly one; `images` is the gallery the page shows.
    image_url: gallery[0] ?? "",
    images: gallery,
    // One short clip, or "". Its own field rather than a member of `images`:
    // the gallery renders an <img> for everything in there.
    video_url: assetUrl(product.videoKey),
    stock: product.stock,
    category_name: record.categoryName,
    category_slug: record.categorySlug,
    branches: (record.branches ?? []).map(publicBranchJson),
    price_tiers: tierRows.map((tier) => ({
      min_quantity: tier.minQuantity,
      unit_price: tier.unitPrice,
    })),
    // Empty for a product sold as one item, which is what the storefront treats
    // as "no selector to show".
    option_types: (product.optionTypes ?? []) as OptionType[],
    variants: variants.map((variant) => ({
      id: variant.id,
      options: variant.options as VariantOptions,
      label: variantLabel(priced, variant.options as VariantOptions),
      // Resolved here so the page can price a selection without re-deriving
      // the fallback-to-product rule in TypeScript.
      price: fromCents(unitPriceForVariant(toPricedVariant(variant), priced, tierRows, 1)),
      stock: variant.stock,
    })),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Promotions
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The combos the home page features, in the storefront's shape.
 *
 * Each one carries its products in full, not just their names: the card lets
 * the buyer add the whole combo *or* any single product in it, and the second
 * half needs a real product to put in the cart (price, tiers, stock, slug).
 */
export async function publicPromotions(now: Date = new Date()) {
  const records = await listPromotions({ active: true });

  const productIds = [
    ...new Set(records.flatMap((record) => record.items.map((item) => item.productId))),
  ];
  const rows = await db
    .select({ product: products, categoryName: categories.name, categorySlug: categories.slug })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(productIds.length ? inArray(products.id, productIds) : sql`false`);
  const catalog = new Map((await hydrate(rows)).map((record) => [record.product.id, record]));

  // A combo whose products went inactive or ran out is filtered here rather
  // than in SQL: availability walks the bundle, and there are only ever a
  // handful of live combos.
  return records
    .filter((record) => comboAvailable({ ...record.promotion }, comboItems(record), 1, now))
    .map((record) => {
      const items = comboItems(record);
      return {
        id: record.promotion.id,
        name: record.promotion.name,
        slug: record.promotion.slug,
        description: record.promotion.description,
        price: record.promotion.price,
        // What the same products cost bought separately, so the card can show
        // the saving instead of asking the buyer to do the arithmetic.
        regular_total: fromCents(regularTotal(items)),
        savings: fromCents(savings(record.promotion, items)),
        discount_percent: discountPercent(record.promotion, items),
        image_url: promotionImageUrl(record),
        // null means untracked; the cart uses it as the quantity cap.
        available_units: availableUnits(items),
        ends_at: record.promotion.endsAt,
        items: record.items.flatMap((item) => {
          const product = catalog.get(item.productId);
          return product
            ? [{ quantity: item.quantity, product: publicProductJson(product) }]
            : [];
        }),
      };
    });
}
