import { relations, sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────────
 * Auth tables (owned by better-auth)
 *
 * better-auth calls these `user`/`session`/`account`/`verification` by default;
 * they are mapped to plural names in src/auth.ts via `modelName` so the whole
 * database reads consistently and no table is a Postgres reserved word.
 *
 * Note `accounts` here does NOT mean what it meant in Rails. In Rails it was
 * the identity table (email + password_hash). In better-auth it is one row per
 * authentication provider per user; password login is the row with
 * providerId = "credential". Identity itself lives in `users`.
 * ──────────────────────────────────────────────────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    // better-auth's required `name` field, mapped to the column the frontend
    // and the Rails schema already call `fullname`.
    fullname: text("fullname").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),

    // Additional fields (declared in src/auth.ts under user.additionalFields).
    username: text("username").notNull(),
    phoneNumber: text("phone_number"),
    identification: text("identification"),
    // Third account state. Rails modelled unverified/verified/closed as one
    // integer column; `emailVerified` above is now the single source of truth
    // for verified, and this timestamp is the single source of truth for
    // closed. `account_status` is derived from the two at the API boundary.
    closedAt: timestamp("closed_at", { withTimezone: true }),

    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${table.username})`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_unique").on(table.token),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    // bcrypt hash for providerId = "credential". Hashes migrated from Rodauth
    // are `$2a$12$...` and are verified as-is (see src/lib/password.ts).
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("id_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("accounts_issuer_account_unique").on(table.issuer, table.accountId),
    index("accounts_user_id_idx").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verifications_identifier_idx").on(table.identifier),
    index("verifications_expires_at_idx").on(table.expiresAt),
  ],
);

/**
 * Unused: the better-auth two-factor plugin was removed (see `api/src/auth.ts`),
 * so nothing reads this table or `users.two_factor_enabled`. Both are kept so
 * the admin OTP gate can be restored without a migration.
 */
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (table) => [
    index("two_factors_user_id_idx").on(table.userId),
    index("two_factors_secret_idx").on(table.secret),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * RBAC (owned by this application)
 *
 * Structure and seeded data are carried over unchanged from
 * backend/app/models/permission.rb so existing role/permission semantics and
 * the 9 permission keys in admin/src/types/auth.ts keep matching.
 * ──────────────────────────────────────────────────────────────────────────── */

export const roles = pgTable(
  "roles",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("roles_name_unique").on(table.name)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    group: varchar("group", { length: 50 }).notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("permissions_key_unique").on(table.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: bigint("permission_id", { mode: "number" })
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("role_permissions_permission_id_idx").on(table.permissionId),
  ],
);

// Replaces rolify's `users_roles`. The Rails schema also carried a dead
// `user_roles` table (uuid user_id) left over from an earlier Python app; it
// held zero rows and is not carried over.
export const userRoles = pgTable(
  "user_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("user_roles_role_id_idx").on(table.roleId),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Business (single-tenant: exactly one row, see AGENTS.md §1)
 * ──────────────────────────────────────────────────────────────────────────── */

export const businesses = pgTable(
  "businesses",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slogan: text("slogan"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    facebook: text("facebook"),
    tiktok: text("tiktok"),
    // Object key in the R2 bucket, e.g. "business/1/logo_1712345678.png".
    // Replaces the Active Storage blob indirection; the files themselves already
    // live under that exact prefix, so no object is moved during migration.
    logoKey: text("logo_key"),

    // Storefront-facing settings. Everything here except `notification_email`
    // is served by GET /api/v1/public/store; that one address is where order
    // notifications go and must never reach the storefront.
    address: text("address"),
    mapsUrl: text("maps_url"),
    aboutTitle: text("about_title"),
    aboutBody: text("about_body"),
    contactIntro: text("contact_intro"),
    deliveryNotes: text("delivery_notes"),
    bankInstructions: text("bank_instructions"),
    primaryColor: text("primary_color"),
    notificationEmail: text("notification_email"),
    // false closes the shop: the public API answers 503 for catalog reads and
    // checkout, while /public/store and existing orders stay reachable.
    published: boolean("published").notNull().default(true),

    // Single-tenant: the unique index plus the check constraint make a second
    // business row impossible at the database level (AGENTS.md §1).
    singletonGuard: integer("singleton_guard").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("businesses_singleton_guard_unique").on(table.singletonGuard),
    check("businesses_singleton_guard_zero", sql`${table.singletonGuard} = 0`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Store domain
 *
 * Ported 1:1 from the Rails schema (backend/db/schema.rb) with one deliberate
 * difference: there is no Active Storage. Every attachment is an object key on
 * the owning row (`image_key`, `file_key`, `video_key`, `payment_proof_key`),
 * the same pattern `businesses.logo_key` already established. That drops three
 * tables and the blob indirection without losing anything.
 *
 * Money is `numeric(10, 2)`, which Drizzle returns as a string. Never do
 * arithmetic on it directly — go through src/lib/money.ts, which works in
 * integer cents. Floating point on prices drifts silently.
 * ──────────────────────────────────────────────────────────────────────────── */

export const categories = pgTable(
  "categories",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    // Denormalised count, kept in sync when products are created, moved or
    // deleted. Rails maintained it with counter_cache.
    productsCount: integer("products_count").notNull().default(0),
    imageKey: text("image_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("categories_slug_unique").on(table.slug),
    index("categories_active_idx").on(table.active),
    index("categories_position_idx").on(table.position),
  ],
);

export const branches = pgTable(
  "branches",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    hours: text("hours"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    mapsUrl: text("maps_url"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("branches_active_idx").on(table.active),
    index("branches_position_idx").on(table.position),
  ],
);

export const downloadableCatalogs = pgTable(
  "downloadable_catalogs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    coverImageKey: text("cover_image_key"),
    fileKey: text("file_key").notNull(),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("downloadable_catalogs_active_idx").on(table.active),
    index("downloadable_catalogs_position_idx").on(table.position),
  ],
);

export const products = pgTable(
  "products",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    // Sanitised HTML (allow-list in src/services/products.ts).
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0.0"),
    compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
    categoryId: bigint("category_id", { mode: "number" }).references(() => categories.id, {
      onDelete: "set null",
    }),
    // Legacy single photo, kept for the POST/DELETE /products/:id/image pair.
    // The gallery in `product_images` takes precedence when it has rows.
    imageKey: text("image_key"),
    videoKey: text("video_key"),
    active: boolean("active").notNull().default(true),
    // NULL means the shop does not track inventory for this product: it never
    // blocks a checkout and is never decremented.
    stock: integer("stock"),
    // [{ name: "Talla", values: ["S", "M"] }] — the axes a variant must define.
    optionTypes: jsonb("option_types").notNull().default([]),
    // Restaurant vertical: the removable defaults that become "Sin ___" buttons.
    defaultIngredients: jsonb("default_ingredients").notNull().default([]),
    kind: text("kind").notNull().default("product"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_active_idx").on(table.active),
    index("products_category_id_idx").on(table.categoryId),
    index("products_kind_idx").on(table.kind),
    check("products_kind_valid", sql`${table.kind} in ('product', 'service')`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    // Position 0 is the main photo — there is no separate "main" flag, so the
    // gallery endpoints re-compact positions after a delete to keep 0 filled.
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("product_images_product_id_position_idx").on(table.productId, table.position),
    index("product_images_product_id_idx").on(table.productId),
  ],
);

export const productBranches = pgTable(
  "product_branches",
  {
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    branchId: bigint("branch_id", { mode: "number" })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.branchId] }),
    index("product_branches_branch_id_idx").on(table.branchId),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // { "Talla": "M", "Color": "Negro" } — keys must match products.option_types.
    options: jsonb("options").notNull().default({}),
    sku: text("sku"),
    // NULL means the variant inherits the product price, price tiers included.
    price: numeric("price", { precision: 10, scale: 2 }),
    stock: integer("stock"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("product_variants_product_id_options_unique").on(table.productId, table.options),
    index("product_variants_product_id_position_idx").on(table.productId, table.position),
    index("product_variants_product_id_idx").on(table.productId),
  ],
);

/**
 * Wholesale ladder. `unit_price` applies from `min_quantity` units up, and the
 * ladder must be strictly decreasing (validated in src/services/products.ts).
 * The quantity that selects the tier is the merged cart quantity, summed across
 * a product's variants — see src/services/order-creator.ts.
 */
export const priceTiers = pgTable(
  "price_tiers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    minQuantity: integer("min_quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("price_tiers_product_id_min_quantity_unique").on(table.productId, table.minQuantity),
  ],
);

/** Combo: a fixed bundle sold as one line at its own price, no ladder. */
export const promotions = pgTable(
  "promotions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0.0"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    imageKey: text("image_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("promotions_slug_unique").on(table.slug),
    index("promotions_active_position_idx").on(table.active, table.position),
  ],
);

export const promotionItems = pgTable(
  "promotion_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    promotionId: bigint("promotion_id", { mode: "number" })
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("promotion_items_promotion_id_product_id_unique").on(
      table.promotionId,
      table.productId,
    ),
    index("promotion_items_promotion_id_position_idx").on(table.promotionId, table.position),
    index("promotion_items_product_id_idx").on(table.productId),
  ],
);

/**
 * `code` is stored already upper-cased, so lookups must upper-case the input
 * and compare against the column directly. Rails queried `UPPER(code) = ?`,
 * which could not use this index.
 */
export const coupons = pgTable(
  "coupons",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    code: text("code").notNull(),
    discountType: text("discount_type").notNull().default("percentage"),
    discountValue: numeric("discount_value", { precision: 10, scale: 2 }).notNull(),
    active: boolean("active").notNull().default(true),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").notNull().default(0),
    minOrderTotal: numeric("min_order_total", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("coupons_code_unique").on(table.code),
    check(
      "coupons_discount_type_valid",
      sql`${table.discountType} in ('percentage', 'fixed')`,
    ),
  ],
);

/** Identified by phone (digits only) — buyers have no account. */
export const customers = pgTable(
  "customers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name"),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    notes: text("notes"),
    // Recomputed from scratch by refreshCustomerStats(), never incremented.
    ordersCount: integer("orders_count").notNull().default(0),
    totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0.0"),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("customers_phone_unique").on(table.phone)],
);

export const orders = pgTable(
  "orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // "RY-00001", derived from the id right after insert. Sequential and
    // guessable, so it authorises nothing — that is public_token's job.
    number: text("number"),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    // Required by the storefront checkout (see routes/public.ts), nullable
    // here because the admin's own order form does not force it and older
    // rows predate the column entirely.
    email: text("email"),
    address: text("address"),
    city: text("city"),
    notes: text("notes"),
    paymentMethod: text("payment_method").notNull(),
    deliveryMethod: text("delivery_method").notNull(),
    status: text("status").notNull().default("pendiente"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0.0"),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0.0"),
    total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0.0"),
    couponId: bigint("coupon_id", { mode: "number" }).references(() => coupons.id, {
      onDelete: "set null",
    }),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, {
      onDelete: "set null",
    }),
    // Random. Authorises the confirmation page and the payment-proof upload.
    // Never leaves the API through an admin serializer.
    publicToken: text("public_token").notNull(),
    paymentProofKey: text("payment_proof_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("orders_number_unique").on(table.number),
    uniqueIndex("orders_public_token_unique").on(table.publicToken),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_coupon_id_idx").on(table.couponId),
    index("orders_customer_id_idx").on(table.customerId),
  ],
);

/**
 * A frozen snapshot. product_name, variant_label, details and unit_price are
 * copied at checkout so deleting a product, variant or combo later never
 * rewrites a past order. Combo lines carry `promotion_id` and no `product_id`.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" }).references(() => products.id, {
      onDelete: "set null",
    }),
    productVariantId: bigint("product_variant_id", { mode: "number" }).references(
      () => productVariants.id,
      { onDelete: "set null" },
    ),
    promotionId: bigint("promotion_id", { mode: "number" }).references(() => promotions.id, {
      onDelete: "set null",
    }),
    productName: text("product_name").notNull(),
    variantLabel: text("variant_label"),
    // Combo contents, e.g. "Sérum x1 · Crema x2".
    details: text("details"),
    quantity: integer("quantity").notNull().default(1),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0.0"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_product_id_idx").on(table.productId),
    index("order_items_product_variant_id_idx").on(table.productVariantId),
    index("order_items_promotion_id_idx").on(table.promotionId),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Restaurant domain (HungerApp)
 *
 * Kept separate from the storefront checkout tables on purpose: a restaurant
 * order has operational state (cash register, kitchen, payments, prep time)
 * that would turn the ecommerce order into a bag of nullable columns.
 * ──────────────────────────────────────────────────────────────────────────── */

export const cashRegisters = pgTable(
  "cash_registers",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    status: text("status").notNull().default("open"),
    businessDate: date("business_date").notNull(),
    openedBy: text("opened_by").notNull().references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedBy: text("closed_by").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingAmount: numeric("opening_amount", { precision: 10, scale: 2 }).notNull().default("0.0"),
    closingAmount: numeric("closing_amount", { precision: 10, scale: 2 }),
    expectedCash: numeric("expected_cash", { precision: 10, scale: 2 }),
    cashTotal: numeric("cash_total", { precision: 10, scale: 2 }),
    transferTotal: numeric("transfer_total", { precision: 10, scale: 2 }),
    cardTotal: numeric("card_total", { precision: 10, scale: 2 }),
    platformTotal: numeric("platform_total", { precision: 10, scale: 2 }),
    totalSales: numeric("total_sales", { precision: 10, scale: 2 }),
    difference: numeric("difference", { precision: 10, scale: 2 }),
    ordersCount: integer("orders_count"),
    ordersPaidCount: integer("orders_paid_count"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("cash_registers_single_open_unique").on(table.status).where(sql`${table.status} = 'open'`),
    index("cash_registers_business_date_idx").on(table.businessDate),
    check("cash_registers_status_valid", sql`${table.status} in ('open', 'closed')`),
    check("cash_registers_opening_amount_non_negative", sql`${table.openingAmount} >= 0`),
    check("cash_registers_closing_amount_non_negative", sql`${table.closingAmount} is null or ${table.closingAmount} >= 0`),
    check("cash_registers_closed_fields_present", sql`${table.status} <> 'closed' or (${table.closedBy} is not null and ${table.closedAt} is not null and ${table.closingAmount} is not null and ${table.expectedCash} is not null and ${table.cashTotal} is not null and ${table.transferTotal} is not null and ${table.totalSales} is not null and ${table.difference} is not null)`),
  ],
);

export const restaurantOrders = pgTable(
  "restaurant_orders",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    number: integer("number"),
    businessDate: date("business_date"),
    customerName: varchar("customer_name", { length: 60 }).notNull(),
    channel: text("channel").notNull().default("local"),
    status: text("status").notNull().default("draft"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull().default("0.0"),
    paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0.0"),
    balanceAmount: numeric("balance_amount", { precision: 10, scale: 2 }).notNull().default("0.0"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    prepSeconds: integer("prep_seconds"),
    deliverySeconds: integer("delivery_seconds"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),
    cashRegisterId: bigint("cash_register_id", { mode: "number" }).references(() => cashRegisters.id),
    userId: text("user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("restaurant_orders_business_date_number_unique")
      .on(table.businessDate, table.number)
      .where(sql`${table.businessDate} is not null and ${table.number} is not null`),
    index("restaurant_orders_status_idx").on(table.status),
    index("restaurant_orders_payment_status_idx").on(table.paymentStatus),
    index("restaurant_orders_cash_register_id_idx").on(table.cashRegisterId),
    check("restaurant_orders_channel_valid", sql`${table.channel} in ('local', 'whatsapp', 'rappi', 'pedidosya', 'self_order')`),
    check("restaurant_orders_status_valid", sql`${table.status} in ('draft', 'preparing', 'ready', 'delivered', 'cancelled')`),
    check("restaurant_orders_payment_status_valid", sql`${table.paymentStatus} in ('pending', 'partially_paid', 'paid')`),
    check("restaurant_orders_customer_name_present", sql`length(trim(${table.customerName})) between 1 and 60`),
    check("restaurant_orders_amounts_consistent", sql`${table.totalAmount} >= 0 and ${table.paidAmount} >= 0 and ${table.balanceAmount} >= 0 and ${table.balanceAmount} = ${table.totalAmount} - ${table.paidAmount}`),
    check("restaurant_orders_confirmed_fields_present", sql`${table.status} = 'draft' or (${table.number} is not null and ${table.businessDate} is not null and ${table.confirmedAt} is not null and ${table.cashRegisterId} is not null)`),
    check("restaurant_orders_ready_after_confirmed", sql`${table.readyAt} is null or ${table.confirmedAt} is not null`),
    check("restaurant_orders_delivered_after_ready", sql`${table.deliveredAt} is null or ${table.readyAt} is not null`),
    check("restaurant_orders_cancelled_fields_present", sql`${table.status} <> 'cancelled' or (${table.cancelledAt} is not null and ${table.cancelledBy} is not null and length(trim(${table.cancelReason})) > 0)`),
  ],
);

export const restaurantOrderItems = pgTable(
  "restaurant_order_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => restaurantOrders.id, { onDelete: "cascade" }),
    productId: bigint("product_id", { mode: "number" }).references(() => products.id),
    productName: text("product_name").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0.0"),
    quantity: integer("quantity").notNull().default(1),
    removedIngredients: jsonb("removed_ingredients").notNull().default([]),
    extras: jsonb("extras").notNull().default([]),
    extrasTotal: numeric("extras_total", { precision: 10, scale: 2 }).notNull().default("0.0"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0.0"),
    notes: text("notes"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("restaurant_order_items_order_id_idx").on(table.orderId),
    index("restaurant_order_items_product_id_idx").on(table.productId),
    check("restaurant_order_items_quantity_positive", sql`${table.quantity} > 0`),
    check("restaurant_order_items_payment_status_valid", sql`${table.paymentStatus} in ('pending', 'paid')`),
    check("restaurant_order_items_amounts_non_negative", sql`${table.unitPrice} >= 0 and ${table.extrasTotal} >= 0 and ${table.subtotal} >= 0`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: bigint("order_id", { mode: "number" })
      .notNull()
      .references(() => restaurantOrders.id),
    cashRegisterId: bigint("cash_register_id", { mode: "number" })
      .notNull()
      .references(() => cashRegisters.id),
    userId: text("user_id").notNull().references(() => users.id),
    paymentMethod: text("payment_method").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    receivedAmount: numeric("received_amount", { precision: 10, scale: 2 }),
    reference: text("reference"),
    receiptKey: text("receipt_key"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_order_id_idx").on(table.orderId),
    index("payments_cash_register_id_idx").on(table.cashRegisterId),
    check("payments_method_valid", sql`${table.paymentMethod} in ('cash', 'transfer', 'card', 'platform')`),
    check("payments_amount_positive", sql`${table.amount} > 0`),
    check("payments_received_amount_valid", sql`(${table.paymentMethod} = 'cash' and (${table.receivedAmount} is null or ${table.receivedAmount} >= ${table.amount})) or (${table.paymentMethod} <> 'cash' and ${table.receivedAmount} is null)`),
  ],
);

export const paymentItems = pgTable(
  "payment_items",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    paymentId: bigint("payment_id", { mode: "number" })
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    orderItemId: bigint("order_item_id", { mode: "number" })
      .notNull()
      .references(() => restaurantOrderItems.id),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_items_order_item_id_unique").on(table.orderItemId),
    index("payment_items_payment_id_idx").on(table.paymentId),
    check("payment_items_amount_positive", sql`${table.amount} > 0`),
  ],
);

/* ────────────────────────────────────────────────────────────────────────────
 * Relations
 * ──────────────────────────────────────────────────────────────────────────── */

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  userRoles: many(userRoles),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  productBranches: many(productBranches),
}));

export const downloadableCatalogsRelations = relations(downloadableCatalogs, () => ({}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  images: many(productImages),
  variants: many(productVariants),
  priceTiers: many(priceTiers),
  promotionItems: many(promotionItems),
  productBranches: many(productBranches),
}));

export const productBranchesRelations = relations(productBranches, ({ one }) => ({
  product: one(products, { fields: [productBranches.productId], references: [products.id] }),
  branch: one(branches, { fields: [productBranches.branchId], references: [branches.id] }),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, { fields: [productImages.productId], references: [products.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
}));

export const priceTiersRelations = relations(priceTiers, ({ one }) => ({
  product: one(products, { fields: [priceTiers.productId], references: [products.id] }),
}));

export const promotionsRelations = relations(promotions, ({ many }) => ({
  items: many(promotionItems),
}));

export const promotionItemsRelations = relations(promotionItems, ({ one }) => ({
  promotion: one(promotions, { fields: [promotionItems.promotionId], references: [promotions.id] }),
  product: one(products, { fields: [promotionItems.productId], references: [products.id] }),
}));

export const couponsRelations = relations(coupons, ({ many }) => ({
  orders: many(orders),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  variant: one(productVariants, {
    fields: [orderItems.productVariantId],
    references: [productVariants.id],
  }),
  promotion: one(promotions, { fields: [orderItems.promotionId], references: [promotions.id] }),
}));

export const cashRegistersRelations = relations(cashRegisters, ({ one, many }) => ({
  openedByUser: one(users, { fields: [cashRegisters.openedBy], references: [users.id] }),
  closedByUser: one(users, { fields: [cashRegisters.closedBy], references: [users.id] }),
  orders: many(restaurantOrders),
  payments: many(payments),
}));

export const restaurantOrdersRelations = relations(restaurantOrders, ({ one, many }) => ({
  cashRegister: one(cashRegisters, {
    fields: [restaurantOrders.cashRegisterId],
    references: [cashRegisters.id],
  }),
  user: one(users, { fields: [restaurantOrders.userId], references: [users.id] }),
  cancelledByUser: one(users, { fields: [restaurantOrders.cancelledBy], references: [users.id] }),
  items: many(restaurantOrderItems),
  payments: many(payments),
}));

export const restaurantOrderItemsRelations = relations(restaurantOrderItems, ({ one, many }) => ({
  order: one(restaurantOrders, {
    fields: [restaurantOrderItems.orderId],
    references: [restaurantOrders.id],
  }),
  product: one(products, { fields: [restaurantOrderItems.productId], references: [products.id] }),
  paymentItems: many(paymentItems),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(restaurantOrders, { fields: [payments.orderId], references: [restaurantOrders.id] }),
  cashRegister: one(cashRegisters, {
    fields: [payments.cashRegisterId],
    references: [cashRegisters.id],
  }),
  user: one(users, { fields: [payments.userId], references: [users.id] }),
  items: many(paymentItems),
}));

export const paymentItemsRelations = relations(paymentItems, ({ one }) => ({
  payment: one(payments, { fields: [paymentItems.paymentId], references: [payments.id] }),
  orderItem: one(restaurantOrderItems, {
    fields: [paymentItems.orderItemId],
    references: [restaurantOrderItems.id],
  }),
}));

/* ────────────────────────────────────────────────────────────────────────────
 * Row types
 * ──────────────────────────────────────────────────────────────────────────── */

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Permission = typeof permissions.$inferSelect;
export type Business = typeof businesses.$inferSelect;

export type Category = typeof categories.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type DownloadableCatalog = typeof downloadableCatalogs.$inferSelect;
export type Product = typeof products.$inferSelect;
export type ProductImage = typeof productImages.$inferSelect;
export type ProductBranch = typeof productBranches.$inferSelect;
export type ProductVariant = typeof productVariants.$inferSelect;
export type PriceTier = typeof priceTiers.$inferSelect;
export type Promotion = typeof promotions.$inferSelect;
export type PromotionItem = typeof promotionItems.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type CashRegister = typeof cashRegisters.$inferSelect;
export type RestaurantOrder = typeof restaurantOrders.$inferSelect;
export type RestaurantOrderItem = typeof restaurantOrderItems.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentItem = typeof paymentItems.$inferSelect;

/** The axes a product declares, stored in products.option_types. */
export type OptionType = { name: string; values: string[] };
/** A variant's chosen value per axis, stored in product_variants.options. */
export type VariantOptions = Record<string, string>;

export const ORDER_STATUSES = [
  "pendiente",
  "confirmado",
  "preparando",
  "entregado",
  "cancelado",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["efectivo", "transferencia"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RESTAURANT_ORDER_STATUSES = [
  "draft",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;
export type RestaurantOrderStatus = (typeof RESTAURANT_ORDER_STATUSES)[number];

export const RESTAURANT_PAYMENT_STATUSES = ["pending", "partially_paid", "paid"] as const;
export type RestaurantPaymentStatus = (typeof RESTAURANT_PAYMENT_STATUSES)[number];

export const RESTAURANT_CHANNELS = ["local", "whatsapp", "rappi", "pedidosya", "self_order"] as const;
export type RestaurantChannel = (typeof RESTAURANT_CHANNELS)[number];

export const CASH_REGISTER_STATUSES = ["open", "closed"] as const;
export type CashRegisterStatus = (typeof CASH_REGISTER_STATUSES)[number];

export const RESTAURANT_PAYMENT_METHODS = ["cash", "transfer", "card", "platform"] as const;
export type RestaurantPaymentMethod = (typeof RESTAURANT_PAYMENT_METHODS)[number];

export const DELIVERY_METHODS = ["domicilio", "retiro"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const PRODUCT_KINDS = ["product", "service"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo: "Efectivo contra entrega",
  transferencia: "Transferencia bancaria",
};

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  domicilio: "Envío a domicilio",
  retiro: "Retiro en local",
};
