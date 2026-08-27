// @ts-check
import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// The shop edits its catalog live, so pages are server-rendered on every
// request. That is also what puts real Open Graph tags in the initial HTML —
// the reason this storefront is not part of the admin SPA.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  site: process.env.STOREFRONT_URL || "http://localhost:4321",
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
    port: 4321,
  },
});
