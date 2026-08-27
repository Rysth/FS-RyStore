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
import {
  accounts,
  categories,
  coupons,
  priceTiers,
  products,
  productVariants,
  promotionItems,
  promotions,
  users,
} from "./schema.ts";
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

/* ────────────────────────────────────────────────────────────────────────────
 * Catalog fixtures
 *
 * Chosen to cover the paths that are easy to break rather than to look like a
 * real shop: a price ladder, a product with two variant axes, a service, an
 * untracked-stock product, a combo, and coupons of both discount types.
 * The order tests in api/test/ depend on these exact slugs and numbers.
 * ──────────────────────────────────────────────────────────────────────────── */

const CATALOG_SLUGS = {
  category: "demo-general",
  ladder: "demo-camiseta",
  variants: "demo-zapato",
  service: "demo-asesoria",
  untracked: "demo-sticker",
  combo: "demo-combo-basico",
} as const;

async function seedCatalog(): Promise<void> {
  const [category] = await db
    .insert(categories)
    .values({ name: "Demo General", slug: CATALOG_SLUGS.category, position: 1 })
    .onConflictDoUpdate({ target: categories.slug, set: { name: "Demo General" } })
    .returning();

  // Wholesale ladder: 10.00 list, 9.00 from 6 units, 8.00 from 12.
  const [ladder] = await db
    .insert(products)
    .values({
      name: "Demo Camiseta",
      slug: CATALOG_SLUGS.ladder,
      price: "10.00",
      stock: 100,
      categoryId: category!.id,
    })
    .onConflictDoUpdate({ target: products.slug, set: { price: "10.00", stock: 100, active: true } })
    .returning();

  await db.delete(priceTiers).where(eq(priceTiers.productId, ladder!.id));
  await db.insert(priceTiers).values([
    { productId: ladder!.id, minQuantity: 6, unitPrice: "9.00" },
    { productId: ladder!.id, minQuantity: 12, unitPrice: "8.00" },
  ]);

  // Two axes, one variant carrying its own price (which opts out of any ladder).
  const [varied] = await db
    .insert(products)
    .values({
      name: "Demo Zapato",
      slug: CATALOG_SLUGS.variants,
      price: "50.00",
      stock: null,
      categoryId: category!.id,
      optionTypes: [
        { name: "Talla", values: ["38", "39"] },
        { name: "Color", values: ["Negro"] },
      ],
    })
    .onConflictDoUpdate({ target: products.slug, set: { price: "50.00", active: true } })
    .returning();

  await db.delete(productVariants).where(eq(productVariants.productId, varied!.id));
  await db.insert(productVariants).values([
    { productId: varied!.id, options: { Talla: "38", Color: "Negro" }, stock: 5, position: 0 },
    { productId: varied!.id, options: { Talla: "39", Color: "Negro" }, stock: 5, price: "55.00", position: 1 },
  ]);

  await db
    .insert(products)
    .values({
      name: "Demo Asesoría",
      slug: CATALOG_SLUGS.service,
      price: "80.00",
      kind: "service",
      stock: null,
      categoryId: category!.id,
    })
    .onConflictDoUpdate({ target: products.slug, set: { price: "80.00", active: true } });

  // stock NULL: the shop does not track inventory for this one.
  const [untracked] = await db
    .insert(products)
    .values({
      name: "Demo Sticker",
      slug: CATALOG_SLUGS.untracked,
      price: "2.00",
      stock: null,
      categoryId: category!.id,
    })
    .onConflictDoUpdate({ target: products.slug, set: { price: "2.00", active: true } })
    .returning();

  const [combo] = await db
    .insert(promotions)
    .values({ name: "Demo Combo Básico", slug: CATALOG_SLUGS.combo, price: "15.00", position: 1 })
    .onConflictDoUpdate({ target: promotions.slug, set: { price: "15.00", active: true } })
    .returning();

  await db.delete(promotionItems).where(eq(promotionItems.promotionId, combo!.id));
  await db.insert(promotionItems).values([
    { promotionId: combo!.id, productId: ladder!.id, quantity: 1, position: 0 },
    { promotionId: combo!.id, productId: untracked!.id, quantity: 2, position: 1 },
  ]);

  await db
    .insert(coupons)
    .values([
      { code: "DEMO10", discountType: "percentage", discountValue: "10.00" },
      { code: "DEMO5OFF", discountType: "fixed", discountValue: "5.00" },
      { code: "DEMOAGOTADO", discountType: "fixed", discountValue: "5.00", usageLimit: 1, usageCount: 1 },
    ])
    .onConflictDoNothing({ target: coupons.code });

  console.log("  catálogo demo: 1 categoría, 4 productos, 1 combo, 3 cupones");
}

async function main(): Promise<void> {
  await seedRbac();

  for (const fixture of FIXTURES) {
    const outcome = await upsert(fixture);
    const verified = fixture.emailVerified ? "verificado" : "SIN verificar";
    console.log(`  ${outcome === "created" ? "creado " : "existía"}  ${fixture.email.padEnd(24)} ${fixture.role.padEnd(9)} ${verified}`);
  }

  await seedCatalog();

  console.log(`\nContraseña para todas las cuentas: ${PASSWORD}`);
}

try {
  await main();
} finally {
  await closeDatabase();
}
