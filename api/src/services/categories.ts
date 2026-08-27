import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { categories, products, type Category } from "../db/schema.ts";
import { uniqueSlug } from "../lib/slug.ts";
import { assetUrl } from "../lib/serializers.ts";

/**
 * Port of backend/app/models/category.rb and CategoriesController's data access.
 *
 * There is no pagination here on purpose: a shop has a handful of categories
 * and the storefront renders all of them as bubbles on one screen.
 */

export const MAX_NAME_LENGTH = 60;

export async function slugForCategory(name: string, currentId?: number): Promise<string> {
  return uniqueSlug(name, async (candidate) => {
    const [row] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        currentId
          ? and(eq(categories.slug, candidate), ne(categories.id, currentId))
          : eq(categories.slug, candidate),
      )
      .limit(1);
    return Boolean(row);
  });
}

/** Case-insensitive, matching the Rails uniqueness validation. */
export async function nameTaken(name: string, currentId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      currentId
        ? and(sql`lower(${categories.name}) = lower(${name})`, ne(categories.id, currentId))
        : sql`lower(${categories.name}) = lower(${name})`,
    )
    .limit(1);
  return Boolean(row);
}

export async function listCategories(filters: { active?: boolean } = {}): Promise<Category[]> {
  const query = db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
  if (filters.active === undefined) return query;
  return query.where(eq(categories.active, filters.active));
}

export async function findCategory(id: number): Promise<Category | null> {
  const [row] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return row ?? null;
}

/** Rails assigned `max(position) + 1` in a before_create hook. */
export async function nextPosition(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${categories.position}), 0)::int` })
    .from(categories);
  return (row?.max ?? 0) + 1;
}

export async function reorderCategories(
  positions: Array<{ id: number; position: number }>,
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const entry of positions) {
      // Rails skipped id 0 — the frontend sends it for an unsaved placeholder.
      if (entry.id === 0) continue;
      await tx
        .update(categories)
        .set({ position: entry.position, updatedAt: new Date() })
        .where(eq(categories.id, entry.id));
    }
  });
}

/**
 * `products_count` replaces Rails' counter_cache. Recomputed rather than
 * incremented so it cannot drift when a product moves between categories.
 */
export async function refreshProductsCount(categoryId: number | null): Promise<void> {
  if (categoryId === null) return;
  await db
    .update(categories)
    .set({
      productsCount: sql`(select count(*)::int from ${products} where ${products.categoryId} = ${categoryId})`,
      updatedAt: new Date(),
    })
    .where(eq(categories.id, categoryId));
}

export function serializeCategory(category: Category) {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    active: category.active,
    featured: category.featured,
    position: category.position,
    image_url: assetUrl(category.imageKey),
    products_count: category.productsCount,
    created_at: category.createdAt.toISOString(),
    updated_at: category.updatedAt.toISOString(),
  };
}
