/**
 * Development / test user fixtures.
 *
 * Rails seeded these from db/seeds/development.rb, deleted when the Rails
 * backend was retired (migration phase 8). Its replacement, `npm run
 * create-admin`, only makes a single administrator — so a fresh database had
 * no way back to the users the test suite (`api/test/`) expects
 * (`manager@example.com`, `operator@example.com`, an unverified account, ...).
 * HungerApp also seeds `cashier@example.com` and `kitchen@example.com` when
 * APP_VERTICAL=restaurant.
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
import { eq, inArray, sql } from "drizzle-orm";
import { isProduction, isRestaurantVertical } from "../config/env.ts";
import { generateId } from "../lib/ids.ts";
import { hashPassword } from "../lib/password.ts";
import { cancelOrder } from "../services/order-canceller.ts";
import { createOrder } from "../services/order-creator.ts";
import type { CheckoutItem } from "../services/order-creator.ts";
import { refreshStats } from "../services/customers.ts";
import { replaceRoles } from "../services/users.ts";
import { closeDatabase, db } from "./client.ts";
import {
  accounts,
  branches,
  businesses,
  categories,
  coupons,
  orders,
  priceTiers,
  productBranches,
  products,
  productVariants,
  promotionItems,
  promotions,
  users,
} from "./schema.ts";
import { seedRbac } from "./seed.ts";
import { getBusiness } from "../services/business.ts";

if (isProduction) {
  console.error("db:seed:dev no se ejecuta con NODE_ENV=production.");
  process.exit(1);
}

const PASSWORD = process.env.DEV_SEED_PASSWORD ?? "password123";

type Fixture = {
  email: string;
  username: string;
  fullname: string;
  role: "admin" | "manager" | "operator" | "user" | "cashier" | "kitchen";
  emailVerified: boolean;
};

const FIXTURES: Fixture[] = [
  { email: "admin@example.com", username: "admin", fullname: "Admin Demo", role: "admin", emailVerified: true },
  { email: "manager@example.com", username: "manager", fullname: "Manager Demo", role: "manager", emailVerified: true },
  { email: "operator@example.com", username: "operator", fullname: "Operator Demo", role: "operator", emailVerified: true },
  { email: "user@example.com", username: "usuario", fullname: "Usuario Demo", role: "user", emailVerified: true },
  { email: "unverified@example.com", username: "sinverificar", fullname: "Sin Verificar", role: "user", emailVerified: false },
];

if (isRestaurantVertical) {
  FIXTURES.push(
    { email: "cashier@example.com", username: "cashier", fullname: "Cajero Demo", role: "cashier", emailVerified: true },
    { email: "kitchen@example.com", username: "kitchen", fullname: "Cocina Demo", role: "kitchen", emailVerified: true },
  );
}

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

  // 12.00 against a regular total of 14.00 (1 x 10.00 + 2 x 2.00). A combo has
  // to cost less than its parts bought separately — the admin refuses to save
  // one that does not, so a fixture that broke the rule would be unreachable
  // through the UI it is meant to stand in for.
  const [combo] = await db
    .insert(promotions)
    .values({ name: "Demo Combo Básico", slug: CATALOG_SLUGS.combo, price: "12.00", position: 1 })
    .onConflictDoUpdate({ target: promotions.slug, set: { price: "12.00", active: true } })
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

/* ────────────────────────────────────────────────────────────────────────────
 * Showcase fixtures — a bigger, more realistic catalog and order history for
 * browsing the admin panel and the storefront by eye.
 *
 * Kept separate from seedCatalog() above: that one is load-bearing for
 * api/test/ (exact slugs, exact prices) and must not move. This one is not
 * load-bearing anywhere and can be edited freely.
 *
 * The catalog (categories/products/promotions/coupons) upserts by slug/code
 * on every run, same pattern as seedCatalog. The order history is generated
 * only once: if any order already exists for the first showcase customer's
 * phone, the whole order phase is skipped, so re-running db:seed:dev never
 * piles up duplicate history. Product stock, on the other hand, resets to its
 * listed value on every run regardless — this is a demo catalog, not an
 * inventory ledger, so a rerun after the order phase already ran will show
 * stock that no longer matches order history exactly. Wipe the database for a
 * fully consistent reset.
 * ──────────────────────────────────────────────────────────────────────────── */

type TierDef = { minQuantity: number; unitPrice: string };
type VariantDef = { options: Record<string, string>; stock: number | null; price?: string };
type ProductDef = {
  name: string;
  slug: string;
  price: string;
  compareAtPrice?: string;
  stock: number | null;
  kind?: "product" | "service";
  category: string;
  active?: boolean;
  description?: string;
  tiers?: TierDef[];
  optionTypes?: { name: string; values: string[] }[];
  variants?: VariantDef[];
};

const SHOWCASE_CATEGORIES: Array<{ name: string; slug: string; position: number }> = [
  { name: "Ropa", slug: "ropa", position: 2 },
  { name: "Calzado", slug: "calzado", position: 3 },
  { name: "Accesorios", slug: "accesorios", position: 4 },
  { name: "Hogar y Cocina", slug: "hogar-cocina", position: 5 },
  { name: "Tecnología", slug: "tecnologia", position: 6 },
  { name: "Belleza y Cuidado", slug: "belleza-cuidado", position: 7 },
  { name: "Bebidas y Snacks", slug: "bebidas-snacks", position: 8 },
  { name: "Servicios", slug: "servicios", position: 9 },
];

const TALLA_ROPA = ["S", "M", "L", "XL"];

const SHOWCASE_PRODUCTS: ProductDef[] = [
  // ── Ropa ──────────────────────────────────────────────────────────────
  {
    name: "Camiseta Básica Algodón 100%",
    slug: "camiseta-basica-algodon",
    price: "12.00",
    stock: 80,
    category: "ropa",
    tiers: [{ minQuantity: 6, unitPrice: "11.00" }, { minQuantity: 12, unitPrice: "10.00" }],
    description: "<p>Camiseta de algodón <strong>100% peinado</strong>, corte unisex.</p><p>Ideal para estampar en lote — por eso tiene precio por mayor.</p>",
  },
  {
    name: "Camiseta Estampada Edición Limitada",
    slug: "camiseta-estampada-edicion",
    price: "15.00",
    compareAtPrice: "18.00",
    stock: 45,
    category: "ropa",
    description: "<p>Estampado exclusivo, tiraje limitado. <em>Cuando se acaba, se acaba.</em></p>",
  },
  {
    name: "Hoodie Unisex Oversize",
    slug: "hoodie-unisex-oversize",
    price: "28.00",
    stock: null,
    category: "ropa",
    optionTypes: [
      { name: "Talla", values: TALLA_ROPA },
      { name: "Color", values: ["Negro", "Gris"] },
    ],
    variants: TALLA_ROPA.flatMap((talla) =>
      ["Negro", "Gris"].map((color) => ({ options: { Talla: talla, Color: color }, stock: 12 })),
    ),
    description: "<p>Corte oversize, felpa interior. Disponible en 8 combinaciones de talla y color.</p>",
  },
  {
    name: "Pantalón Jean Clásico",
    slug: "pantalon-jean-clasico",
    price: "32.00",
    stock: null,
    category: "ropa",
    optionTypes: [{ name: "Talla", values: ["28", "30", "32", "34"] }],
    variants: ["28", "30", "32", "34"].map((talla) => ({ options: { Talla: talla }, stock: 15 })),
  },
  {
    name: "Vestido Casual de Verano",
    slug: "vestido-casual-verano",
    price: "25.00",
    compareAtPrice: "30.00",
    stock: 20,
    category: "ropa",
  },
  // Low stock on purpose — shows up in the dashboard's "productos por acabarse".
  { name: "Chompa Polar Térmica", slug: "chompa-polar-termica", price: "22.00", stock: 3, category: "ropa" },
  // Inactive on purpose — a discontinued line, hidden from the storefront but
  // still visible (and re-activatable) in the admin.
  {
    name: "Blusa Elegante de Oficina",
    slug: "blusa-elegante-oficina",
    price: "18.00",
    stock: 25,
    category: "ropa",
    active: false,
  },

  // ── Calzado ───────────────────────────────────────────────────────────
  {
    name: "Zapatillas Urbanas Running",
    slug: "zapatillas-urbanas-running",
    price: "45.00",
    stock: null,
    category: "calzado",
    optionTypes: [{ name: "Talla", values: ["37", "38", "39", "40", "41", "42"] }],
    // The 42 sells out on purpose — a variant genuinely out of stock, not just
    // untracked, so the storefront can show "agotado" on one option and not
    // the others.
    variants: ["37", "38", "39", "40", "41", "42"].map((talla) => ({
      options: { Talla: talla },
      stock: talla === "42" ? 0 : 10,
    })),
    description: "<p>Suela de EVA, malla transpirable. Seis tallas disponibles.</p>",
  },
  {
    name: "Sandalias de Playa",
    slug: "sandalias-playa",
    price: "15.00",
    stock: 60,
    category: "calzado",
    tiers: [{ minQuantity: 6, unitPrice: "13.50" }, { minQuantity: 12, unitPrice: "12.00" }],
  },
  {
    name: "Botines de Cuero",
    slug: "botines-cuero",
    price: "55.00",
    stock: null,
    category: "calzado",
    description: "<p>Cuero genuino, forro interior acolchado.</p>",
  },
  {
    name: "Zapatos Formales de Vestir",
    slug: "zapatos-formales-vestir",
    price: "60.00",
    stock: null,
    category: "calzado",
    optionTypes: [{ name: "Talla", values: ["39", "40", "41", "42", "43"] }],
    variants: ["39", "40", "41", "42", "43"].map((talla) => ({ options: { Talla: talla }, stock: 8 })),
  },

  // ── Accesorios ────────────────────────────────────────────────────────
  {
    name: "Gorra Bordada Snapback",
    slug: "gorra-bordada-snapback",
    price: "10.00",
    stock: 90,
    category: "accesorios",
    tiers: [{ minQuantity: 6, unitPrice: "9.00" }, { minQuantity: 12, unitPrice: "8.00" }],
  },
  {
    name: "Bolso de Mano Elegante",
    slug: "bolso-mano-elegante",
    price: "24.00",
    compareAtPrice: "29.00",
    stock: 12,
    category: "accesorios",
    description: "<p>Correa desmontable, compartimento interior con cierre.</p>",
  },
  {
    name: "Cinturón de Cuero Genuino",
    slug: "cinturon-cuero-genuino",
    price: "14.00",
    stock: null,
    category: "accesorios",
    optionTypes: [{ name: "Talla", values: ["S", "M", "L"] }],
    variants: ["S", "M", "L"].map((talla) => ({ options: { Talla: talla }, stock: 20 })),
  },
  {
    name: "Reloj Deportivo Resistente al Agua",
    slug: "reloj-deportivo-resistente-agua",
    price: "35.00",
    stock: 18,
    category: "accesorios",
  },
  {
    name: "Mochila Escolar Impermeable",
    slug: "mochila-escolar-impermeable",
    price: "27.00",
    stock: null,
    category: "accesorios",
    description: "<p>Compartimento acolchado para laptop de hasta 15 pulgadas.</p>",
  },

  // ── Hogar y Cocina ────────────────────────────────────────────────────
  {
    name: "Set de Vasos de Vidrio x6",
    slug: "set-vasos-vidrio-x6",
    price: "9.00",
    stock: 100,
    category: "hogar-cocina",
    tiers: [{ minQuantity: 6, unitPrice: "8.00" }, { minQuantity: 12, unitPrice: "7.00" }],
  },
  { name: "Termo de Acero Inoxidable 1L", slug: "termo-acero-inoxidable-1l", price: "13.50", stock: 40, category: "hogar-cocina" },
  // Low stock on purpose.
  { name: "Organizador Multiusos de Cocina", slug: "organizador-multiusos-cocina", price: "7.00", stock: 2, category: "hogar-cocina" },
  {
    name: "Juego de Sábanas Queen",
    slug: "juego-sabanas-queen",
    price: "32.00",
    stock: null,
    category: "hogar-cocina",
    description: "<p>Microfibra 2 plazas, incluye funda de almohada.</p>",
  },

  // ── Tecnología ────────────────────────────────────────────────────────
  {
    name: "Audífonos Bluetooth Inalámbricos",
    slug: "audifonos-bluetooth-inalambricos",
    price: "18.00",
    compareAtPrice: "25.00",
    stock: 30,
    category: "tecnologia",
    description: "<p>Autonomía de 6 horas, estuche de carga incluido.</p>",
  },
  { name: "Power Bank 10000mAh", slug: "power-bank-10000mah", price: "16.00", stock: 22, category: "tecnologia" },
  {
    name: "Funda Protectora para Celular",
    slug: "funda-protectora-celular",
    price: "5.00",
    stock: 150,
    category: "tecnologia",
    tiers: [{ minQuantity: 10, unitPrice: "4.00" }, { minQuantity: 20, unitPrice: "3.50" }],
  },
  { name: "Cargador Tipo C Rápido", slug: "cargador-tipo-c-rapido", price: "6.50", stock: null, category: "tecnologia" },

  // ── Belleza y Cuidado ─────────────────────────────────────────────────
  { name: "Kit de Maquillaje Básico", slug: "kit-maquillaje-basico", price: "20.00", stock: 15, category: "belleza-cuidado" },
  {
    name: "Crema Hidratante Facial",
    slug: "crema-hidratante-facial",
    price: "9.50",
    stock: 70,
    category: "belleza-cuidado",
    tiers: [{ minQuantity: 6, unitPrice: "8.50" }, { minQuantity: 12, unitPrice: "7.50" }],
  },
  // Low stock on purpose — exactly at the dashboard's threshold (<= 5).
  { name: "Set de Brochas de Maquillaje x5", slug: "set-brochas-maquillaje-x5", price: "12.00", stock: 5, category: "belleza-cuidado" },

  // ── Bebidas y Snacks ──────────────────────────────────────────────────
  {
    name: "Caja de Snacks Surtidos x12",
    slug: "caja-snacks-surtidos-x12",
    price: "8.00",
    stock: 60,
    category: "bebidas-snacks",
    tiers: [{ minQuantity: 6, unitPrice: "7.50" }, { minQuantity: 12, unitPrice: "7.00" }],
  },
  {
    name: "Café Molido Artesanal 500g",
    slug: "cafe-molido-artesanal-500g",
    price: "6.00",
    stock: 45,
    category: "bebidas-snacks",
    description: "<p>Tueste medio, molido para cafetera de goteo.</p>",
  },

  // ── Servicios ─────────────────────────────────────────────────────────
  {
    name: "Asesoría de Imagen Personal",
    slug: "asesoria-imagen-personal",
    price: "40.00",
    stock: null,
    kind: "service",
    category: "servicios",
    description: "<p>Sesión de una hora, presencial o por videollamada.</p>",
  },
  { name: "Diseño de Logo Express", slug: "diseno-logo-express", price: "35.00", stock: null, kind: "service", category: "servicios" },
  { name: "Clases de Maquillaje (1 hora)", slug: "clases-maquillaje-1-hora", price: "25.00", stock: null, kind: "service", category: "servicios" },
];

type PromotionDef = {
  name: string;
  slug: string;
  price: string;
  items: Array<{ product: string; quantity: number }>;
  startsAt?: Date;
  endsAt?: Date;
};

const DAY_MS = 86_400_000;

const SHOWCASE_PROMOTIONS: PromotionDef[] = [
  {
    name: "Combo Verano",
    slug: "combo-verano",
    price: "25.00",
    items: [{ product: "camiseta-estampada-edicion", quantity: 1 }, { product: "sandalias-playa", quantity: 1 }],
  },
  {
    name: "Combo Tech Esencial",
    slug: "combo-tech-esencial",
    price: "36.00",
    items: [
      { product: "audifonos-bluetooth-inalambricos", quantity: 1 },
      { product: "power-bank-10000mah", quantity: 1 },
      { product: "funda-protectora-celular", quantity: 2 },
    ],
  },
  {
    name: "Kit Belleza Completa",
    slug: "kit-belleza-completa",
    price: "25.00",
    items: [{ product: "kit-maquillaje-basico", quantity: 1 }, { product: "crema-hidratante-facial", quantity: 1 }],
  },
  {
    name: "Pack Café y Snacks",
    slug: "pack-cafe-snacks",
    price: "11.50",
    items: [{ product: "cafe-molido-artesanal-500g", quantity: 1 }, { product: "caja-snacks-surtidos-x12", quantity: 1 }],
  },
  // Already ended — shows up in the admin list but the storefront won't offer it.
  {
    name: "Combo Black Friday",
    slug: "combo-black-friday",
    price: "28.00",
    items: [{ product: "gorra-bordada-snapback", quantity: 1 }, { product: "bolso-mano-elegante", quantity: 1 }],
    endsAt: new Date(Date.now() - 20 * DAY_MS),
  },
  // Not yet open — same idea, the other direction.
  {
    name: "Combo Navideño",
    slug: "combo-navideno",
    price: "34.00",
    items: [{ product: "termo-acero-inoxidable-1l", quantity: 1 }, { product: "mochila-escolar-impermeable", quantity: 1 }],
    startsAt: new Date(Date.now() + 15 * DAY_MS),
  },
];

type CouponDef = {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number;
  usageCount?: number;
  minOrderTotal?: string;
};

const SHOWCASE_COUPONS: CouponDef[] = [
  { code: "BIENVENIDA15", discountType: "percentage", discountValue: "15.00" },
  { code: "ENVIOGRATIS", discountType: "fixed", discountValue: "3.00" },
  { code: "PRIMERACOMPRA", discountType: "fixed", discountValue: "5.00", usageLimit: 200 },
  { code: "VERANO20", discountType: "percentage", discountValue: "20.00", minOrderTotal: "50.00" },
  { code: "MAYORISTA10", discountType: "percentage", discountValue: "10.00", minOrderTotal: "100.00" },
  // Expired — still listed, so the admin can see what an expired coupon looks like.
  { code: "BLACKFRIDAY30", discountType: "percentage", discountValue: "30.00", expiresAt: new Date(Date.now() - 20 * DAY_MS) },
  // Not yet open.
  { code: "NAVIDAD25", discountType: "percentage", discountValue: "25.00", startsAt: new Date(Date.now() + 15 * DAY_MS) },
  // Used up — usage_count already at usage_limit.
  { code: "AGOTADO2024", discountType: "fixed", discountValue: "10.00", usageLimit: 3, usageCount: 3 },
];

/** Coupons safe for the order generator to apply blind: always active, no minimum. */
const SAFE_COUPON_CODES = ["BIENVENIDA15", "ENVIOGRATIS", "PRIMERACOMPRA"];

/** Wholesale-ladder products — occasionally ordered in bulk to show the tier price. */
const LADDER_PRODUCT_SLUGS = new Set([
  "camiseta-basica-algodon",
  "sandalias-playa",
  "gorra-bordada-snapback",
  "set-vasos-vidrio-x6",
  "funda-protectora-celular",
  "crema-hidratante-facial",
  "caja-snacks-surtidos-x12",
]);

/**
 * Products the order generator draws from. Deliberately excludes the two
 * low-stock items, the inactive one, and the zero-stock variant's product is
 * included but that one variant is filtered out at pick time — those exist to
 * be *seen* in the admin and storefront, not to be raced for stock by dozens
 * of synthetic orders.
 */
const ORDERABLE_PRODUCT_SLUGS = SHOWCASE_PRODUCTS.filter(
  (product) =>
    product.kind !== "service" &&
    product.active !== false &&
    !["chompa-polar-termica", "organizador-multiusos-cocina", "set-brochas-maquillaje-x5"].includes(product.slug),
).map((product) => product.slug);

const COMBO_ORDER_SLUGS = SHOWCASE_PROMOTIONS.filter((promotion) => !promotion.startsAt && !promotion.endsAt).map(
  (promotion) => promotion.slug,
);

type CustomerSpec = { name: string; phone: string; city: string; address: string; orderCount: number };

const SHOWCASE_CUSTOMERS: CustomerSpec[] = [
  { name: "María José Salazar", phone: "0999100001", city: "Quito", address: "Av. Amazonas N34-120 y Naciones Unidas", orderCount: 5 },
  { name: "Carlos Andrés Pérez", phone: "0999100002", city: "Guayaquil", address: "Cdla. Kennedy, Mz 4 Villa 12", orderCount: 3 },
  { name: "Andrea Fernanda Torres", phone: "0999100003", city: "Cuenca", address: "Av. Solano y Remigio Crespo", orderCount: 2 },
  { name: "Luis Alberto Chávez", phone: "0999100004", city: "Ambato", address: "Av. Cevallos y Mera", orderCount: 1 },
  { name: "Gabriela Nicole Ramírez", phone: "0999100005", city: "Manta", address: "Malecón Escénico, Edif. Pacífico", orderCount: 4 },
  { name: "Diego Fernando Vera", phone: "0999100006", city: "Loja", address: "Av. Universitaria y 18 de Noviembre", orderCount: 2 },
  { name: "Camila Sofía Mora", phone: "0999100007", city: "Quito", address: "Av. 6 de Diciembre N24-100", orderCount: 5 },
  { name: "Jorge Eduardo Castillo", phone: "0999100008", city: "Machala", address: "Av. Las Palmeras y 25 de Junio", orderCount: 1 },
  { name: "Valentina Paz Jiménez", phone: "0999100009", city: "Riobamba", address: "Av. Daniel León Borja y Duchicela", orderCount: 3 },
  { name: "Kevin Steven Ortiz", phone: "0999100010", city: "Guayaquil", address: "Urdesa Central, Circunvalación Sur", orderCount: 2 },
  { name: "Daniela Alejandra Suárez", phone: "0999100011", city: "Quito", address: "Av. República del Salvador N35-200", orderCount: 1 },
  { name: "Miguel Ángel Rodríguez", phone: "0999100012", city: "Cuenca", address: "Av. Ordóñez Lasso y Los Cerezos", orderCount: 4 },
  { name: "Paula Ximena Guerrero", phone: "0999100013", city: "Ambato", address: "Av. Los Guaytambos y Rumiñahui", orderCount: 2 },
  { name: "Bryan Josué Cedeño", phone: "0999100014", city: "Manta", address: "Av. 4 de Noviembre y Circunvalación", orderCount: 3 },
];

const SERVICE_ORDER_CUSTOMERS: Array<{ name: string; phone: string; city: string; service: string }> = [
  { name: "Fernanda Ibarra", phone: "0999100015", city: "Quito", service: "asesoria-imagen-personal" },
  { name: "Ricardo Peñafiel", phone: "0999100016", city: "Guayaquil", service: "diseno-logo-express" },
  { name: "Sofía Naranjo", phone: "0999100017", city: "Cuenca", service: "clases-maquillaje-1-hora" },
  { name: "Andrés Villacís", phone: "0999100018", city: "Quito", service: "diseno-logo-express" },
];

const SHOWCASE_BRANCHES = [
  {
    name: "Quito Norte - Shyris",
    address: "Av. de los Shyris N35-174 y Portugal, Quito",
    hours: "Lunes a sábado de 10h00 a 20h00",
    phone: "+593 98 551 3958",
    whatsapp: "+593 98 551 3958",
    mapsUrl: "https://maps.google.com/?q=Av.+de+los+Shyris+Quito",
  },
  {
    name: "Quito Sur - Recreo",
    address: "Centro Comercial El Recreo, local A52, Quito",
    hours: "Lunes a sábado de 10h00 a 20h00",
    phone: "+593 99 861 0408",
    whatsapp: "+593 99 861 0408",
    mapsUrl: "https://maps.google.com/?q=Centro+Comercial+El+Recreo+Quito",
  },
  {
    name: "Guayaquil Norte - Kennedy",
    address: "Av. Francisco de Orellana y Miguel H. Alcívar, Guayaquil",
    hours: "Lunes a viernes de 09h30 a 18h30",
    phone: "+593 96 899 2062",
    whatsapp: "+593 96 899 2062",
    mapsUrl: "https://maps.google.com/?q=Kennedy+Norte+Guayaquil",
  },
  {
    name: "Cuenca Centro",
    address: "Calle Bolívar y Benigno Malo, Cuenca",
    hours: "Lunes a sábado de 09h00 a 18h00",
    phone: "+593 96 084 9146",
    whatsapp: "+593 96 084 9146",
    mapsUrl: "https://maps.google.com/?q=Centro+Cuenca+Ecuador",
  },
] as const;

const BRANCH_PRODUCT_SLUGS: Record<string, string[]> = {
  "Quito Norte - Shyris": [
    "camiseta-basica-algodon",
    "hoodie-unisex-oversize",
    "zapatillas-urbanas-running",
    "audifonos-bluetooth-inalambricos",
    "power-bank-10000mah",
    "kit-maquillaje-basico",
    "asesoria-imagen-personal",
  ],
  "Quito Sur - Recreo": [
    "camiseta-estampada-edicion",
    "sandalias-playa",
    "gorra-bordada-snapback",
    "bolso-mano-elegante",
    "set-vasos-vidrio-x6",
    "crema-hidratante-facial",
    "clases-maquillaje-1-hora",
  ],
  "Guayaquil Norte - Kennedy": [
    "zapatillas-urbanas-running",
    "zapatos-formales-vestir",
    "funda-protectora-celular",
    "cargador-tipo-c-rapido",
    "cafe-molido-artesanal-500g",
    "caja-snacks-surtidos-x12",
    "diseno-logo-express",
  ],
  "Cuenca Centro": [
    "pantalon-jean-clasico",
    "vestido-casual-verano",
    "termo-acero-inoxidable-1l",
    "mochila-escolar-impermeable",
    "juego-sabanas-queen",
    "set-brochas-maquillaje-x5",
  ],
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** `[status, weight]` pairs — roughly 15/20/15/40/10% pendiente..cancelado. */
function weightedStatus(): string {
  const weights: Array<[string, number]> = [
    ["pendiente", 3],
    ["confirmado", 4],
    ["preparando", 3],
    ["entregado", 8],
    ["cancelado", 2],
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [status, weight] of weights) {
    if (roll < weight) return status;
    roll -= weight;
  }
  return "entregado";
}

async function upsertShowcaseCategories(): Promise<Map<string, number>> {
  const ids = new Map<string, number>();
  for (const category of SHOWCASE_CATEGORIES) {
    const [row] = await db
      .insert(categories)
      .values({ name: category.name, slug: category.slug, position: category.position })
      .onConflictDoUpdate({
        target: categories.slug,
        set: { name: category.name, position: category.position, active: true },
      })
      .returning();
    ids.set(category.slug, row!.id);
  }
  return ids;
}

type ProductRow = { id: number; hasVariants: boolean };

async function upsertShowcaseProducts(
  categoryIds: Map<string, number>,
): Promise<{ products: Map<string, ProductRow>; variants: Map<string, Array<{ id: number; stock: number | null }>> }> {
  const productRows = new Map<string, ProductRow>();
  const variantRows = new Map<string, Array<{ id: number; stock: number | null }>>();

  for (const def of SHOWCASE_PRODUCTS) {
    const [row] = await db
      .insert(products)
      .values({
        name: def.name,
        slug: def.slug,
        price: def.price,
        compareAtPrice: def.compareAtPrice ?? null,
        stock: def.stock,
        kind: def.kind ?? "product",
        categoryId: categoryIds.get(def.category)!,
        active: def.active ?? true,
        description: def.description ?? null,
        optionTypes: def.optionTypes ?? [],
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          price: def.price,
          compareAtPrice: def.compareAtPrice ?? null,
          stock: def.stock,
          active: def.active ?? true,
          description: def.description ?? null,
          optionTypes: def.optionTypes ?? [],
        },
      })
      .returning();

    productRows.set(def.slug, { id: row!.id, hasVariants: Boolean(def.variants?.length) });

    if (def.tiers) {
      await db.delete(priceTiers).where(eq(priceTiers.productId, row!.id));
      await db.insert(priceTiers).values(def.tiers.map((tier) => ({ productId: row!.id, ...tier })));
    }

    if (def.variants) {
      await db.delete(productVariants).where(eq(productVariants.productId, row!.id));
      const inserted = await db
        .insert(productVariants)
        .values(
          def.variants.map((variant, position) => ({
            productId: row!.id,
            options: variant.options,
            stock: variant.stock,
            price: variant.price ?? null,
            position,
          })),
        )
        .returning({ id: productVariants.id, stock: productVariants.stock });
      variantRows.set(def.slug, inserted);
    }
  }

  return { products: productRows, variants: variantRows };
}

async function upsertShowcasePromotions(products: Map<string, ProductRow>): Promise<Map<string, number>> {
  const ids = new Map<string, number>();

  for (const [index, def] of SHOWCASE_PROMOTIONS.entries()) {
    const position = 10 + index;
    const [row] = await db
      .insert(promotions)
      .values({
        name: def.name,
        slug: def.slug,
        price: def.price,
        position,
        startsAt: def.startsAt ?? null,
        endsAt: def.endsAt ?? null,
      })
      .onConflictDoUpdate({
        target: promotions.slug,
        set: { price: def.price, active: true, position, startsAt: def.startsAt ?? null, endsAt: def.endsAt ?? null },
      })
      .returning();

    ids.set(def.slug, row!.id);

    await db.delete(promotionItems).where(eq(promotionItems.promotionId, row!.id));
    await db.insert(promotionItems).values(
      def.items.map((item, position) => ({
        promotionId: row!.id,
        productId: products.get(item.product)!.id,
        quantity: item.quantity,
        position,
      })),
    );
  }

  return ids;
}

async function upsertShowcaseCoupons(): Promise<void> {
  for (const def of SHOWCASE_COUPONS) {
    await db
      .insert(coupons)
      .values({
        code: def.code,
        discountType: def.discountType,
        discountValue: def.discountValue,
        startsAt: def.startsAt ?? null,
        expiresAt: def.expiresAt ?? null,
        usageLimit: def.usageLimit ?? null,
        usageCount: def.usageCount ?? 0,
        minOrderTotal: def.minOrderTotal ?? null,
      })
      .onConflictDoUpdate({
        target: coupons.code,
        set: {
          discountType: def.discountType,
          discountValue: def.discountValue,
          startsAt: def.startsAt ?? null,
          expiresAt: def.expiresAt ?? null,
          usageLimit: def.usageLimit ?? null,
          usageCount: def.usageCount ?? 0,
          minOrderTotal: def.minOrderTotal ?? null,
        },
      });
  }
}

/** Backdates an order and refreshes its contact's stats to match. */
async function finalizeShowcaseOrder(orderId: number, at: Date): Promise<void> {
  await db.update(orders).set({ createdAt: at, updatedAt: at }).where(eq(orders.id, orderId));

  const [row] = await db.select({ customerId: orders.customerId }).from(orders).where(eq(orders.id, orderId));
  if (row?.customerId) await refreshStats(row.customerId);
}

async function seedShowcaseOrders(
  productRows: Map<string, ProductRow>,
  variantRows: Map<string, Array<{ id: number; stock: number | null }>>,
  promotionIds: Map<string, number>,
): Promise<void> {
  const [already] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.phone, SHOWCASE_CUSTOMERS[0]!.phone))
    .limit(1);
  if (already) {
    console.log("  vitrina: historial de pedidos ya sembrado, se omite");
    return;
  }

  let created = 0;

  for (const customer of SHOWCASE_CUSTOMERS) {
    for (let i = 0; i < customer.orderCount; i++) {
      const items: CheckoutItem[] = [];
      const used = new Set<string>();
      const lineCount = randomInt(1, 3);

      for (let line = 0; line < lineCount; line++) {
        if (Math.random() < 0.15 && COMBO_ORDER_SLUGS.length > 0) {
          const slug = pick(COMBO_ORDER_SLUGS);
          if (used.has(`combo:${slug}`)) continue;
          used.add(`combo:${slug}`);
          items.push({ promotion_id: promotionIds.get(slug)!, quantity: 1 });
          continue;
        }

        const slug = pick(ORDERABLE_PRODUCT_SLUGS);
        const product = productRows.get(slug)!;
        const variants = variantRows.get(slug);

        let variantId: number | undefined;
        if (product.hasVariants) {
          const available = (variants ?? []).filter((variant) => variant.stock === null || variant.stock > 0);
          if (available.length === 0) continue;
          variantId = pick(available).id;
        }

        const key = `${slug}:${variantId ?? ""}`;
        if (used.has(key)) continue;
        used.add(key);

        let quantity = randomInt(1, 4);
        if (LADDER_PRODUCT_SLUGS.has(slug) && Math.random() < 0.15) quantity = randomInt(6, 14);

        items.push({ product_id: product.id, ...(variantId ? { variant_id: variantId } : {}), quantity });
      }

      if (items.length === 0) continue;

      const daysAgo = randomInt(0, 150);
      const orderDate = new Date(Date.now() - daysAgo * DAY_MS - randomInt(0, DAY_MS));
      const paymentMethod = Math.random() < 0.55 ? "efectivo" : "transferencia";
      const deliveryMethod = Math.random() < 0.65 ? "domicilio" : "retiro";
      const couponCode = Math.random() < 0.3 ? pick(SAFE_COUPON_CODES) : null;

      const result = await createOrder({
        customer: {
          customer_name: customer.name,
          phone: customer.phone,
          address: deliveryMethod === "domicilio" ? customer.address : null,
          city: customer.city,
          payment_method: paymentMethod,
          delivery_method: deliveryMethod,
        },
        items,
        couponCode,
        now: orderDate,
      });

      if (!result.success) {
        console.warn(`  vitrina: pedido omitido (${result.errors.join(", ")})`);
        continue;
      }

      const status = weightedStatus();
      if (status === "cancelado") {
        await cancelOrder(result.orderId);
      } else if (status !== "pendiente") {
        await db.update(orders).set({ status }).where(eq(orders.id, result.orderId));
      }

      await finalizeShowcaseOrder(result.orderId, orderDate);
      created++;
    }
  }

  // A handful of pure-service orders — these carry their own rule (transferencia
  // + retiro only), so they are generated separately from the physical-goods loop.
  for (const spec of SERVICE_ORDER_CUSTOMERS) {
    const product = productRows.get(spec.service)!;
    const daysAgo = randomInt(0, 90);
    const orderDate = new Date(Date.now() - daysAgo * DAY_MS);

    const result = await createOrder({
      customer: {
        customer_name: spec.name,
        phone: spec.phone,
        city: spec.city,
        payment_method: "transferencia",
        delivery_method: "retiro",
      },
      items: [{ product_id: product.id, quantity: 1 }],
      now: orderDate,
    });

    if (!result.success) {
      console.warn(`  vitrina: pedido de servicio omitido (${result.errors.join(", ")})`);
      continue;
    }

    const status = weightedStatus();
    if (status === "cancelado") await cancelOrder(result.orderId);
    else if (status !== "pendiente") await db.update(orders).set({ status }).where(eq(orders.id, result.orderId));

    await finalizeShowcaseOrder(result.orderId, orderDate);
    created++;
  }

  console.log(`  vitrina: ${created} pedidos generados para ${SHOWCASE_CUSTOMERS.length + SERVICE_ORDER_CUSTOMERS.length} contactos`);
}

async function seedShowcase(): Promise<void> {
  const categoryIds = await upsertShowcaseCategories();
  const { products: productRows, variants: variantRows } = await upsertShowcaseProducts(categoryIds);
  const promotionIds = await upsertShowcasePromotions(productRows);
  await upsertShowcaseCoupons();
  await seedShowcaseOrders(productRows, variantRows, promotionIds);

  console.log(
    `  vitrina: ${SHOWCASE_CATEGORIES.length} categorías, ${SHOWCASE_PRODUCTS.length} productos, ${SHOWCASE_PROMOTIONS.length} combos, ${SHOWCASE_COUPONS.length} cupones`,
  );
}

async function seedWebContent(): Promise<void> {
  const business = await getBusiness();
  await db
    .update(businesses)
    .set({
      aboutTitle: "Sobre Tienda de Prueba",
      aboutBody:
        "Somos una tienda ecuatoriana pensada para vender de forma simple, rápida y cercana. Combinamos catálogo online, atención por WhatsApp y puntos de atención físicos para que cada cliente pueda comprar con confianza.\n\nNuestro objetivo es mostrar productos claros, precios actualizados y opciones de contacto directas. Si necesitas confirmar disponibilidad, retirar en una sucursal o pedir asesoría, nuestro equipo está listo para ayudarte.",
      contactIntro:
        "Escríbenos para confirmar disponibilidad, resolver dudas sobre productos o coordinar retiro en una sucursal. También puedes visitarnos en cualquiera de nuestros puntos de atención.",
      updatedAt: new Date(),
    })
    .where(eq(businesses.id, business.id));

  const branchIds = new Map<string, number>();
  for (const [index, branch] of SHOWCASE_BRANCHES.entries()) {
    const [existing] = await db.select().from(branches).where(eq(branches.name, branch.name)).limit(1);
    const values = {
      name: branch.name,
      address: branch.address,
      hours: branch.hours,
      phone: branch.phone,
      whatsapp: branch.whatsapp,
      mapsUrl: branch.mapsUrl,
      active: true,
      position: index + 1,
      updatedAt: new Date(),
    };

    const [row] = existing
      ? await db.update(branches).set(values).where(eq(branches.id, existing.id)).returning()
      : await db.insert(branches).values(values).returning();

    branchIds.set(branch.name, row!.id);
  }

  const slugs = [...new Set(Object.values(BRANCH_PRODUCT_SLUGS).flat())];
  const productRows = await db.select({ id: products.id, slug: products.slug }).from(products).where(inArray(products.slug, slugs));
  const productsBySlug = new Map(productRows.map((product) => [product.slug, product.id]));

  if (productRows.length > 0) {
    await db.delete(productBranches).where(inArray(productBranches.productId, productRows.map((product) => product.id)));
  }

  const links = Object.entries(BRANCH_PRODUCT_SLUGS).flatMap(([branchName, productSlugs]) => {
    const branchId = branchIds.get(branchName);
    if (!branchId) return [];
    return productSlugs
      .map((slug) => productsBySlug.get(slug))
      .filter((productId): productId is number => productId !== undefined)
      .map((productId) => ({ branchId, productId }));
  });

  if (links.length > 0) {
    await db.insert(productBranches).values(links).onConflictDoNothing();
  }

  console.log(`  sitio web demo: ${SHOWCASE_BRANCHES.length} sucursales, ${links.length} disponibilidades`);
}

async function main(): Promise<void> {
  await seedRbac();

  for (const fixture of FIXTURES) {
    const outcome = await upsert(fixture);
    const verified = fixture.emailVerified ? "verificado" : "SIN verificar";
    console.log(`  ${outcome === "created" ? "creado " : "existía"}  ${fixture.email.padEnd(24)} ${fixture.role.padEnd(9)} ${verified}`);
  }

  await seedCatalog();
  await seedShowcase();
  await seedWebContent();

  console.log(`\nContraseña para todas las cuentas: ${PASSWORD}`);
}

try {
  await main();
} finally {
  await closeDatabase();
}
