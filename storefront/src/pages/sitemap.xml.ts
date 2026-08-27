import type { APIRoute } from "astro";
import { fetchCategories, fetchProducts } from "../lib/api";

/**
 * Built at request time, not at build time.
 *
 * @astrojs/sitemap only sees prerendered routes, so in this SSR app it emitted
 * the cart and checkout (which robots.txt disallows) and zero product pages —
 * the exact inverse of what we want indexed. The catalog is also edited live,
 * so a build-time sitemap would go stale the moment the shop adds a product.
 */
export const GET: APIRoute = async ({ site, url }) => {
  const origin = (site ?? new URL(url.origin)).origin;

  const paths = new Set<string>(["/"]);

  try {
    const { categories } = await fetchCategories();
    for (const category of categories) {
      paths.add(`/?categoria=${encodeURIComponent(category.slug)}`);
    }
  } catch {
    // A partial sitemap beats a 500.
  }

  try {
    // One page is plenty for a single-shop catalog; bump if a client outgrows it.
    const { products } = await fetchProducts({ perPage: 500 });
    for (const product of products) {
      paths.add(`/producto/${encodeURIComponent(product.slug)}`);
    }
  } catch {
    // Same as above.
  }

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[...paths].map(
      (path) =>
        `<url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`,
    ),
    "</urlset>",
  ].join("");

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
