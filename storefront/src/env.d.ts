/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** API base used during SSR (container-to-container, e.g. http://rystore-api:3000). */
  readonly API_INTERNAL_URL: string;
  /** API base used from the buyer's browser (e.g. https://api.tienda.com). */
  readonly PUBLIC_API_URL: string;
  /** Canonical storefront origin, used for canonical/OG URLs and the sitemap. */
  readonly STOREFRONT_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
