/**
 * An interactive REPL for a running deployment — the replacement for
 * `bin/rails console`.
 *
 * Node has no framework console, but its standard-library `repl` module is the
 * same idea: this script starts a normal Node REPL with the database client,
 * the full Drizzle schema, the query helpers, and the service layer already in
 * scope, so you can poke at production data without writing a throwaway script.
 *
 *   npm run console
 *
 *   > await db.select().from(users).limit(5)
 *   > await db.select().from(users).where(eq(users.email, "me@example.com"))
 *   > await findUser("<id>")
 *   > await replaceRoles("<id>", ["admin"])
 *   > await sql`select count(*) from users`.execute(db)   // raw SQL
 *
 * Top-level `await` works at the prompt (Node 24). The connection pool is
 * closed automatically when you exit with Ctrl-D or `.exit`.
 *
 * It talks to whatever DATABASE_URL resolves to, so running it against
 * production is running it against production. There is no undo.
 */
import repl from "node:repl";
import * as drizzleOrm from "drizzle-orm";
import { db, pool, closeDatabase } from "../src/db/client.ts";
import { env, isProduction } from "../src/config/env.ts";
import * as schema from "../src/db/schema.ts";
import * as userService from "../src/services/users.ts";
import * as businessService from "../src/services/business.ts";
import * as seed from "../src/db/seed.ts";
import { generateId } from "../src/lib/ids.ts";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";

const dbHost = (() => {
  try {
    return new URL(env.DATABASE_URL).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
})();

console.log(`api console — ${isProduction ? "PRODUCTION" : env.NODE_ENV} — db ${dbHost}`);
console.log("in scope: db, pool, sql, schema tables (users, roles, businesses, …),");
console.log("          drizzle helpers (eq, and, or, ilike, inArray, desc, asc, …),");
console.log("          services (findUser, listUsers, replaceRoles, getBusiness, …),");
console.log("          seedRbac, generateId, hashPassword, verifyPassword");
console.log("exit with Ctrl-D\n");

const server = repl.start({ prompt: "api> ", useGlobal: true });

Object.assign(server.context, {
  db,
  pool,
  env,
  schema,
  ...schema,
  ...drizzleOrm,
  ...userService,
  ...businessService,
  ...seed,
  generateId,
  hashPassword,
  verifyPassword,
});

server.on("exit", () => {
  closeDatabase().finally(() => process.exit(0));
});
