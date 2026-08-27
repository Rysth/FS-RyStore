import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDatabase } from "./client.ts";

/**
 * Applies pending migrations from ./drizzle, replacing `rails db:migrate` in
 * the container start command.
 *
 * This uses drizzle-orm's runtime migrator rather than `drizzle-kit migrate`
 * on purpose. drizzle-kit is a devDependency, but it does end up in the
 * production image anyway, because better-auth declares it as an optional peer
 * dependency and npm installs it even under --omit=dev. That is incidental and
 * a lockfile refresh or a better-auth upgrade could take it away, so relying on
 * it would be fragile. The migrator needs only the SQL files and the journal,
 * both of which are copied into the image.
 */
await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
console.log("Migraciones aplicadas.");
await closeDatabase();
