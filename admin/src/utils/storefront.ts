/**
 * Public storefront origin.
 *
 * The storefront is a separate Astro deployment on its own origin, so every
 * link to it is a plain anchor rather than a router link. Falls back to the dev
 * port when VITE_STOREFRONT_URL is not set.
 */
export const STOREFRONT_URL =
  import.meta.env.VITE_STOREFRONT_URL || "http://localhost:4321";
