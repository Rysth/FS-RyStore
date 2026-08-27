import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env, isProduction } from "../config/env.ts";

/**
 * Single shared pool. These deployments are single-tenant and low traffic
 * (AGENTS.md §1), so a small pool is deliberate — it keeps Postgres connection
 * pressure negligible when the api and worker containers run side by side.
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: isProduction ? 10 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle(pool);

export type Database = typeof db;

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
