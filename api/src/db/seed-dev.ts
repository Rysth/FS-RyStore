/**
 * Development / test user fixtures.
 *
 * Rails seeded these from db/seeds/development.rb, deleted when the Rails
 * backend was retired (migration phase 8). Its replacement, `npm run
 * create-admin`, only makes a single administrator — so a fresh database had
 * no way back to the users the test suite (`api/test/`) expects
 * (`manager@example.com`, `operator@example.com`, an unverified account, …).
 * This script restores that set.
 *
 *   npm run db:seed:dev
 *
 * Every account uses the same password (`password123`, or DEV_SEED_PASSWORD).
 * It refuses to run with NODE_ENV=production. It is idempotent: an existing
 * email keeps its password and only has its roles re-asserted, so it is safe
 * to run repeatedly and before every `npm test`.
 *
 * It writes through the same path as POST /api/v1/users and `create-admin`
 * (user row + `credential` account + replaceRoles), so the accounts are
 * indistinguishable from ones made in the admin UI.
 */
import { eq, sql } from "drizzle-orm";
import { isProduction } from "../config/env.ts";
import { generateId } from "../lib/ids.ts";
import { hashPassword } from "../lib/password.ts";
import { replaceRoles } from "../services/users.ts";
import { closeDatabase, db } from "./client.ts";
import { accounts, users } from "./schema.ts";
import { seedRbac } from "./seed.ts";

if (isProduction) {
  console.error("db:seed:dev no se ejecuta con NODE_ENV=production.");
  process.exit(1);
}

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "password123";

type Fixture = {
  email: string;
  username: string;
  fullname: string;
  role: "admin" | "manager" | "operator" | "user";
  emailVerified: boolean;
};

const FIXTURES: Fixture[] = [
  { email: "admin@example.com", username: "admin", fullname: "Admin Demo", role: "admin", emailVerified: true },
  { email: "manager@example.com", username: "manager", fullname: "Manager Demo", role: "manager", emailVerified: true },
  { email: "operator@example.com", username: "operator", fullname: "Operator Demo", role: "operator", emailVerified: true },
  { email: "user@example.com", username: "usuario", fullname: "Usuario Demo", role: "user", emailVerified: true },
  { email: "unverified@example.com", username: "sinverificar", fullname: "Sin Verificar", role: "user", emailVerified: false },
];

/** `username` is unique (case-insensitively). Fall back to a numbered variant. */
async function freeUsername(preferred: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? preferred : `${preferred}${attempt + 1}`;
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${candidate})`);
    if (!taken) return candidate;
  }
  throw new Error(`No se encontró un usuario libre a partir de '${preferred}'.`);
}

async function upsert(fixture: Fixture): Promise<"created" | "updated"> {
  const email = fixture.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    await replaceRoles(existing.id, [fixture.role]);
    return "updated";
  }

  const userId = generateId();
  await db.insert(users).values({
    id: userId,
    email,
    username: await freeUsername(fixture.username),
    fullname: fixture.fullname,
    emailVerified: fixture.emailVerified,
  });
  await db.insert(accounts).values({
    id: generateId(),
    userId,
    accountId: userId,
    providerId: "credential",
    issuer: "local:credential",
    password: await hashPassword(PASSWORD),
  });
  await replaceRoles(userId, [fixture.role]);
  return "created";
}

async function main(): Promise<void> {
  await seedRbac();

  for (const fixture of FIXTURES) {
    const outcome = await upsert(fixture);
    const verified = fixture.emailVerified ? "verificado" : "SIN verificar";
    console.log(`  ${outcome === "created" ? "creado " : "existía"}  ${fixture.email.padEnd(24)} ${fixture.role.padEnd(9)} ${verified}`);
  }

  console.log(`\nContraseña para todas las cuentas: ${PASSWORD}`);
}

try {
  await main();
} finally {
  await closeDatabase();
}
