/**
 * URL slugs for categories, products and combos.
 *
 * Port of backend/app/services/sluggable.rb. Slugs are part of the storefront's
 * public URLs (`/producto/<slug>`), so the normalisation has to keep matching
 * what Rails produced or existing links break.
 */

/**
 * "Camiseta Básica Ñandú" -> "camiseta-basica-nandu".
 *
 * Decomposes to NFD and drops combining marks, so accented Spanish characters
 * become their ASCII base letter rather than disappearing.
 */
export function slugify(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "item";
}

/**
 * Appends -2, -3, … until the slug is free.
 *
 * `isTaken` runs the scoped uniqueness query — it must exclude the row being
 * updated, otherwise renaming a product back to its own slug bumps it to -2.
 */
export async function uniqueSlug(
  value: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value);

  let candidate = base;
  let suffix = 2;
  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}
