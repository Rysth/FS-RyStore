/**
 * One-way data migration: Rails/Rodauth database -> Fastify/better-auth database.
 *
 * This project ships as a template, so a fresh install does not need this
 * script — `drizzle-kit migrate` plus `npm run db:seed` is enough. It exists
 * for client deployments that already hold Rodauth data.
 *
 * Design rules:
 *   - ADDITIVE ONLY. It reads the Rails database and never writes to it, so a
 *     failed run can be retried and a rollback is just "keep using Rails".
 *   - IDEMPOTENT. Re-running matches existing rows by email and updates them
 *     instead of inserting duplicates.
 *
 * Usage:
 *   RAILS_DATABASE_URL=postgres://... DATABASE_URL=postgres://... \
 *     node scripts/migrate-from-rails.ts [--dry-run]
 */
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import * as schema from "../src/db/schema.ts";
import { generateId } from "../src/lib/ids.ts";
import { seedRbac } from "../src/db/seed.ts";

const DRY_RUN = process.argv.includes("--dry-run");

const railsUrl = process.env.RAILS_DATABASE_URL;
const targetUrl = process.env.DATABASE_URL;

if (!railsUrl || !targetUrl) {
  console.error("Faltan RAILS_DATABASE_URL y/o DATABASE_URL.");
  process.exit(1);
}
if (railsUrl === targetUrl) {
  console.error("RAILS_DATABASE_URL y DATABASE_URL no pueden ser la misma base de datos.");
  process.exit(1);
}

type RailsUser = {
  user_id: string;
  account_id: string;
  email: string;
  password_hash: string | null;
  status: number;
  fullname: string | null;
  username: string | null;
  phone_number: string | null;
  identification: string | null;
  created_at: Date;
  updated_at: Date;
  role_names: string[] | null;
};

const railsPool = new pg.Pool({ connectionString: railsUrl });
const targetPool = new pg.Pool({ connectionString: targetUrl });
const db = drizzle(targetPool, { schema });

async function main(): Promise<void> {
  if (DRY_RUN) console.log("MODO SIMULACIÓN: no se escribirá nada.\n");

  // Roles and permissions must exist before user_roles can reference them.
  if (!DRY_RUN) await seedRbac();

  const { rows: railsUsers } = await railsPool.query<RailsUser>(`
    SELECT
      u.id::text            AS user_id,
      a.id::text            AS account_id,
      a.email,
      a.password_hash,
      a.status,
      u.fullname,
      u.username,
      u.phone_number,
      u.identification,
      u.created_at,
      u.updated_at,
      array_remove(array_agg(r.name), NULL) AS role_names
    FROM users u
    JOIN accounts a ON a.id = u.account_id
    LEFT JOIN users_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    GROUP BY u.id, a.id
    ORDER BY u.id
  `);

  const roleRows = await db.select({ id: schema.roles.id, name: schema.roles.name }).from(schema.roles);
  const roleIdByName = new Map(roleRows.map((row) => [row.name, row.id]));

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const problems: string[] = [];

  for (const railsUser of railsUsers) {
    const email = railsUser.email.trim().toLowerCase();

    if (!railsUser.username || !railsUser.fullname) {
      problems.push(`${email}: sin username o fullname, omitido`);
      skipped++;
      continue;
    }
    if (!railsUser.password_hash) {
      problems.push(`${email}: sin password_hash, tendrá que restablecer su contraseña`);
    }

    const existing = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${email}`)
      .limit(1);

    const userId = existing[0]?.id ?? generateId();
    const isAdmin = (railsUser.role_names ?? []).includes("admin");

    const values = {
      id: userId,
      fullname: railsUser.fullname,
      email,
      // Rails modelled status as 1=unverified, 2=verified, 3=closed.
      emailVerified: railsUser.status === 2,
      closedAt: railsUser.status === 3 ? railsUser.updated_at : null,
      username: railsUser.username,
      phoneNumber: railsUser.phone_number,
      identification: railsUser.identification,
      // OTP at login is required for admins only (AGENTS.md §4). Under Rodauth
      // that was a hard-coded role check; here it is a per-user flag.
      twoFactorEnabled: isAdmin,
      createdAt: railsUser.created_at,
      updatedAt: railsUser.updated_at,
    };

    if (DRY_RUN) {
      if (existing[0]) updated++;
      else created++;
      continue;
    }

    await db.transaction(async (tx) => {
      await tx
        .insert(schema.users)
        .values(values)
        .onConflictDoUpdate({ target: schema.users.id, set: values });

      if (railsUser.password_hash) {
        // Rodauth's bcrypt hash is carried across untouched, so existing
        // passwords keep working (see src/lib/password.ts).
        await tx
          .insert(schema.accounts)
          .values({
            id: generateId(),
            userId,
            accountId: userId,
            providerId: "credential",
            issuer: "local:credential",
            password: railsUser.password_hash,
          })
          .onConflictDoUpdate({
            target: [schema.accounts.issuer, schema.accounts.accountId],
            set: { password: railsUser.password_hash, updatedAt: new Date() },
          });
      }

      await tx.delete(schema.userRoles).where(eq(schema.userRoles.userId, userId));
      const roleIds = (railsUser.role_names ?? [])
        .map((name) => roleIdByName.get(name))
        .filter((id): id is number => id !== undefined);
      if (roleIds.length > 0) {
        await tx
          .insert(schema.userRoles)
          .values(roleIds.map((roleId) => ({ userId, roleId })))
          .onConflictDoNothing();
      }
    });

    if (existing[0]) updated++;
    else created++;
  }

  // Business: the Rails app only ever read `Business.current`, which is
  // `Business.first`. Any other rows are seed noise and are not carried over.
  const { rows: businesses } = await railsPool.query<{
    id: string;
    name: string | null;
    slogan: string | null;
    whatsapp: string | null;
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
    created_at: Date;
    updated_at: Date;
    logo_key: string | null;
  }>(`
    SELECT b.id::text, b.name, b.slogan, b.whatsapp, b.instagram, b.facebook, b.tiktok,
           b.created_at, b.updated_at,
           (SELECT bl.key
              FROM active_storage_attachments att
              JOIN active_storage_blobs bl ON bl.id = att.blob_id
             WHERE att.record_type = 'Business' AND att.record_id = b.id AND att.name = 'logo'
             ORDER BY att.id DESC LIMIT 1) AS logo_key
      FROM businesses b
     ORDER BY b.id
  `);

  const primaryBusiness = businesses[0];
  if (primaryBusiness && !DRY_RUN) {
    const businessValues = {
      id: 1,
      name: primaryBusiness.name ?? "MicroBiz",
      slogan: primaryBusiness.slogan,
      whatsapp: primaryBusiness.whatsapp,
      instagram: primaryBusiness.instagram,
      facebook: primaryBusiness.facebook,
      tiktok: primaryBusiness.tiktok,
      // The R2 objects already live under this key; nothing is re-uploaded.
      logoKey: primaryBusiness.logo_key,
      createdAt: primaryBusiness.created_at,
      updatedAt: primaryBusiness.updated_at,
    };
    await db
      .insert(schema.businesses)
      .values(businessValues)
      .onConflictDoUpdate({ target: schema.businesses.id, set: businessValues });
  }

  console.log(`Usuarios creados:                 ${created}`);
  console.log(`Usuarios existentes actualizados: ${updated}`);
  console.log(`Usuarios omitidos:                ${skipped}`);
  console.log(
    `Negocio: ${primaryBusiness ? `migrado (id ${primaryBusiness.id})` : "ninguno"}` +
      (businesses.length > 1 ? `, ${businesses.length - 1} fila(s) extra ignorada(s)` : ""),
  );
  if (problems.length > 0) {
    console.log(`\nIncidencias (${problems.length}):`);
    for (const problem of problems) console.log(`  - ${problem}`);
  }

  await verify();
}

async function verify(): Promise<void> {
  const [railsCounts, targetCounts] = await Promise.all([
    railsPool.query<{ users: string; verified: string; assignments: string }>(`
      SELECT (SELECT count(*) FROM users)                       AS users,
             (SELECT count(*) FROM accounts WHERE status = 2)   AS verified,
             (SELECT count(*) FROM users_roles)                 AS assignments
    `),
    targetPool.query<{ users: string; verified: string; assignments: string }>(`
      SELECT (SELECT count(*) FROM users)                        AS users,
             (SELECT count(*) FROM users WHERE email_verified)   AS verified,
             (SELECT count(*) FROM user_roles)                   AS assignments
    `),
  ]);

  const before = railsCounts.rows[0]!;
  const after = targetCounts.rows[0]!;
  console.log("\nComparación Rails -> Fastify");
  for (const key of ["users", "verified", "assignments"] as const) {
    const match = before[key] === after[key] ? "OK     " : "REVISAR";
    console.log(`  ${match}  ${key}: ${before[key]} -> ${after[key]}`);
  }
}

try {
  await main();
} catch (error) {
  // A stack trace from pg is not actionable for someone running this on a
  // client's server. The two failures that actually happen are a bad
  // connection string and a Rails database that is not there any more.
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`\nLa migración falló: ${detail}`);
  console.error("Revisa RAILS_DATABASE_URL y DATABASE_URL. No se escribió nada en la base de datos de Rails.");
  process.exitCode = 1;
} finally {
  await railsPool.end();
  await targetPool.end();
}
