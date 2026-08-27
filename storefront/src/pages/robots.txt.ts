import type { APIRoute } from "astro";

// Buyer-specific and transient pages stay out of the index; the catalog and
// product pages are exactly what we want crawled.
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL("sitemap.xml", site ?? "http://localhost:4321").href;

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /carrito",
    "Disallow: /checkout",
    "Disallow: /pedido/",
    "",
    `Sitemap: ${sitemap}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
