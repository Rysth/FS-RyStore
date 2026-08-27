/**
 * Creates the first administrator of a deployment.
 *
 * Rails covered this from db/seeds/development.rb, which built accounts with
 * BCrypt directly and only ran in development — a production install had no
 * supported way to get its first user. This script replaces it for both.
 *
 * It writes through the same path as POST /api/v1/users (pre-verified user +
 * credential account + replaceRoles), so the account it produces is
 * indistinguishable from one created in the admin UI.
 *
 * Usage:
 *   npm run create-admin                       # reads ADMIN_EMAIL / ADMIN_PASSWORD
 *   ADMIN_EMAIL=me@example.com npm run create-admin
 *
 * Leaving ADMIN_PASSWORD unset generates a strong password and prints it once.
 * Re-running against an existing email does not touch the account; it only
 * grants the admin role if it is missing, so it is safe in a start command.
 */
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, closeDatabase } from "../src/db/client.ts";
import { accounts, users } from "../src/db/schema.ts";
import { generateId } from "../src/lib/ids.ts";
import { hashPassword } from "../src/lib/password.ts";
import { replaceRoles } from "../src/services/users.ts";
import { seedRbac } from "../src/db/seed.ts";

const email = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
const suppliedPassword = process.env.ADMIN_PASSWORD;
const fullname = process.env.ADMIN_FULLNAME ?? "Administrador";
const username = process.env.ADMIN_USERNAME ?? "admin";

// base64url of 24 bytes: no shell-hostile characters, so it survives being
// pasted into a terminal or an env file.
const password = suppliedPassword || randomBytes(24).toString("base64url");

/**
 * `username` is unique. On a fresh install the preferred name is free, but a
 * deployment migrated from Rails already has an `admin`, and the insert would
 * fail on the constraint instead of saying why.
 */
async function availableUsername(preferred: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = attempt === 0 ? preferred : `${preferred}${attempt + 1}`;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate));
    if (!taken) {
      if (candidate !== preferred) {
        console.log(`El usuario '${preferred}' ya estaba en uso; se usará '${candidate}'.`);
      }
      return candidate;
    }
  }
  throw new Error(`No se encontró un nombre de usuario libre a partir de '${preferred}'.`);
}

async function main(): Promise<void> {
  // The roles have to exist before one can be granted.
  await seedRbac();

  const [existing] = await db.select().from(users).where(eq(users.email, email));

  if (existing) {
    const granted = await replaceRoles(existing.id, ["admin"]);
    console.log(`El usuario ${email} ya existe. Roles: ${granted.join(", ")}`);
    console.log("La contraseña no se ha modificado. Usa el flujo de recuperación si la olvidaste.");
    return;
  }

  const userId = generateId();

  await db.insert(users).values({
    id: userId,
    email,
    username: await availableUsername(username),
    fullname,
    emailVerified: true,
  });

  await db.insert(accounts).values({
    id: generateId(),
    userId,
    accountId: userId,
    providerId: "credential",
    issuer: "local:credential",
    password: await hashPassword(password),
  });

  await replaceRoles(userId, ["admin"]);

  console.log(`Administrador creado: ${email}`);
  if (suppliedPassword) {
    console.log("Contraseña: la indicada en ADMIN_PASSWORD.");
  } else {
    console.log(`Contraseña generada: ${password}`);
    console.log("Guárdala ahora: no se vuelve a mostrar.");
  }
}

try {
  await main();
} finally {
  await closeDatabase();
}
