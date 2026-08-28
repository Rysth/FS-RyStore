# AGENTS.md — RyStore

> Canonical instructions for any AI coding assistant working on this repo (Claude Code, OpenCode, GitHub Copilot, etc.). `CLAUDE.md` and `.github/copilot-instructions.md` point here — edit **this** file, not those.
>
> Section numbers are cited from code comments (`AGENTS.md §4`). Renumbering breaks those references — repurpose a section rather than deleting it.

---

## 1. Stack Overview

RyStore is a WhatsApp catalog and checkout for small shops. Three apps: the buyer
browses the **storefront**, the shop runs the **admin**, and both talk to one **API**.

| Layer        | Tech                                                        | Port (dev)          |
| ------------ | ------------------------------------------------------------ | -------------------- |
| **Admin**    | React 19, TypeScript 5.7, Vite 6, TailwindCSS 4, Shadcn/ui   | 5173                  |
| **Storefront** | Astro 5 SSR (node standalone adapter) + React islands, Bun | 4321                  |
| **Backend**  | Fastify 5, better-auth, Drizzle ORM, Zod (Node 24, TypeScript) | 3000                |
| **Worker**   | pg-boss (`npm run worker`, same codebase, separate `worker` container) | — (jobs only) |
| **Database** | PostgreSQL 16                                                 | 5432 (internal only) |
| **Queue**    | pg-boss, in its own schema on the same Postgres — no Redis, no extra service | — |
| **Email (dev)** | Mailpit (in-browser SMTP inbox)                            | 8025                  |

Node 24 runs TypeScript directly via type stripping, so **there is no build step and no compiler in the production image**. `erasableSyntaxOnly` in `api/tsconfig.json` makes `tsc --noEmit` reject syntax Node cannot strip (enums, parameter properties, decorators) at typecheck time rather than at runtime. Import paths carry the `.ts` extension for the same reason.

The storefront is server-rendered on every request, not a SPA. That is deliberate:
the shop's whole distribution channel is pasting a product link into WhatsApp, and
WhatsApp reads Open Graph tags out of the **initial HTML** — a client-rendered page
would preview as a blank card. Verify with:

```bash
curl -A "WhatsApp/2.23" http://localhost:4321/producto/<slug> | grep 'og:'
```

There is no mobile app in this repo. Don't create one unless explicitly asked.

The project is distributed **self-hosted, single-tenant per client** via Docker Compose — each deployment serves one client, low traffic, exactly one row in `businesses`. Design decisions favor simplicity over scale.

---

## 2. Repository Layout

```
FS-RyStore/
├── admin/                       # React 19 admin SPA (Vite + Bun)
├── api/                         # Fastify API + pg-boss worker (Node 24, TypeScript)
├── storefront/                  # Astro 5 SSR shop the buyer sees (Bun)
├── docker-compose.yml           # Production compose
├── docker-compose.dev.yml       # Development (+ Postgres, mailpit)
├── setup.sh                     # First-time project bootstrap
├── DEPLOYMENT.md                # Production deployment guide
├── AGENTS.md                    # ← You are here (canonical instructions)
├── CLAUDE.md                    # Pointer to AGENTS.md
└── .github/
    ├── copilot-instructions.md          # Pointer to AGENTS.md
    └── instructions/copilot-instructions.md  # Pointer to AGENTS.md (legacy path)
```

History: this repo began as a generic React + Fastify template whose Rails backend was
migrated to Fastify. The RyStore domain — catalog, orders, coupons, contacts, reports,
storefront — was then ported on top of it from the Rails app at `../RyStore`.

---

## 3. Global Conventions

- **Code**: always English (variable/function names, comments, git commits).
- **User-facing text**: always **Spanish** (labels, error messages, toasts, emails, validation messages). This is a hard rule, not a style preference — every store, route and component in this codebase follows it. better-auth answers in English, so `api/src/lib/auth-errors.ts` maps its error codes to Spanish; an unmapped code logs a warning and falls back to a generic Spanish message rather than shipping English.
- **Git**: one feature/fix per branch, concise commit messages, only commit when explicitly asked.

---

## 4. Authentication & Sessions

This is **not** a bearer-JWT API. Auth is **better-auth, cookie/session-based** (`rr.session_token`, HttpOnly, SameSite=Lax, 14-day lifetime). Config lives in `api/src/auth.ts`; session resolution in `api/src/lib/session.ts`.

better-auth's own handler is mounted under `/api/v1/auth/*` by `api/src/routes/auth.ts`, which wraps it to reshape errors into the project envelope (§7) while leaving successful payloads untouched, since the frontend reads them directly.

| Route                                       | Notes                                    |
| -------------------------------------------- | ----------------------------------------- |
| `POST /api/v1/auth/sign-in/email`            | One step for every role; returns the session |
| `POST /api/v1/auth/sign-up/email`            | Synthetic success on an existing address (enumeration protection) |
| `POST /api/v1/auth/sign-out`                 |                                           |
| `POST /api/v1/auth/request-password-reset`   | Vague on purpose about whether the address exists |
| `POST /api/v1/auth/reset-password`           |                                           |
| `POST /api/v1/auth/verify-email`             |                                           |
| `POST /api/v1/auth/send-verification-email`  |                                           |

**No two-factor / OTP.** The Rails deployment gated the `admin` role behind an emailed one-time code (better-auth `twoFactor` plugin). It was removed to drop the hard SMTP dependency at sign-in, so **login is a single step for every role**. `users.two_factor_enabled` and the `two_factors` table remain in the schema (unused) so the gate can be restored without a migration — re-add the `twoFactor` plugin in `api/src/auth.ts`, a `syncTwoFactorWithRoles` call in `replaceRoles`, and the OTP branch in the admin `authStore`/`AuthSignIn`.

Passwords are bcrypt via `bcryptjs` at cost 12, which reads the `$2a$12$` hashes the Rails/Rodauth deployment produced — a migrated deployment never has to reset passwords.

---

## 5. Background Jobs (pg-boss)

Jobs run in the `worker` container off the same codebase (`api/src/jobs/`). pg-boss uses its own schema on the application's Postgres, so a client's server still needs no Redis and no extra service (§1).

| Queue                     | Purpose                                            | Schedule        |
| -------------------------- | --------------------------------------------------- | ---------------- |
| `send-email`               | Auth mail (verification, reset, admin invitation)   | on demand |
| `order-notification`       | Tells the shop an order arrived, or that its buyer uploaded a receipt | on demand |
| `cleanup-verifications`    | Expired rows in better-auth's `verifications`        | hourly (`0 * * * *`) |
| `cleanup-sessions`         | Expired sessions — better-auth leaves them in place | daily (`30 3 * * *`) |

Mail is queued rather than sent inline so a transient SMTP failure is retried with backoff instead of costing a user their invitation. Queue creation is **sequential**: `create_queue` takes a `ShareRowExclusiveLock` on the same partitioned table, so concurrent creation deadlocks on startup.

`order-notification` is enqueued from the **request** that created the order, never from
inside `createOrder`: that saves in a transaction, so notifying there would fire before
the commit and the handler could read an order that does not exist yet. Its handler
re-reads the order rather than trusting the payload, and returns quietly — never throws —
in the three cases that are not failures: the order was deleted between enqueue and
execution, `businesses.notification_email` is blank (a deliberate opt-out), or the event
name is unknown. Throwing would make pg-boss retry five times over something no retry can
fix. **The buyer never receives mail**: they have no account and no email on file, and
WhatsApp is their channel.

Licensing used to live in this section. It was removed entirely in migration phase 3 at the owner's request: no verifier, no global hook, no `license/status` endpoint, no 402 responses, no `LICENSE_KEY`. Client deployments are not time-gated. **Don't reintroduce it without being asked.**

---

## 6. RBAC — Roles & Permissions

18 permission keys, defined in `api/src/db/seed.ts` (`PERMISSION_KEYS`) and mirrored in `admin/src/types/auth.ts` (`Permissions` const — must stay in sync):

- **Panel**: `view_dashboard`, `edit_profile`
- **Users**: `view_users`, `create_users`, `edit_users`, `delete_users`, `export_users`
- **Business**: `view_business`, `edit_business`
- **Shop**: `view_catalog`, `manage_catalog`, `view_orders`, `manage_orders`, `view_coupons`, `manage_coupons`, `view_contacts`, `manage_contacts`, `view_reports`

Combos live under the catalog pair rather than getting their own: a combo is a way of selling the catalog, and a shop that can edit products can edit the bundles made of them. Reports get their own key because they expose more granular business data than the dashboard cards do.

Default role → permission mapping (`ROLE_DEFAULTS`, applied by `seedRbac()`, which is idempotent and runs on every container start):

| Role         | Permissions                                    |
| ------------ | ----------------------------------------------- |
| **admin**    | All 18                                           |
| **manager**  | All 18 (currently identical to admin)            |
| **operator** | `view_dashboard`, `edit_profile`, `view_catalog`, `view_orders`, `manage_orders` |
| **user**     | `edit_profile` only                              |

Admin and manager are currently identical: same permissions, and login is one step for both (§4).

The operator is the shop's counter staff: they work orders all day (`manage_orders`) and need to look things up in the catalog (`view_catalog`, read-only), but they do not touch pricing, coupons, the contact list or the reports. `getDefaultAdminRoute` lands them on `/dashboard/orders` for that reason.

**Backend**: use the preHandlers in `api/src/middleware/authorize.ts`:
```ts
{ preHandler: requireAuth }
{ preHandler: requirePermission(PERMISSION_KEYS.VIEW_USERS) }
// Several keys mean ANY of them, matching Rails' authorize_any_permission!
{ preHandler: requirePermission(PERMISSION_KEYS.EDIT_USERS, PERMISSION_KEYS.CREATE_USERS) }
```
Permissions are the union across all of a user's roles, resolved in one query by `loadAuthorization`.

**Frontend**: `useAuthStore()` exposes `hasPermission(key)`, `hasAnyPermission(...keys)`, `hasRole(role)`. Prefer the `Permissions.X` constant (`admin/src/types/auth.ts`) over raw string literals — most of the codebase does this, but `pages/dashboard/users/*` uses raw strings (`"edit_users"`) as a pre-existing inconsistency; don't propagate it into new code.

---

## 7. Backend — Fastify API

### Directory structure (current)

```
api/
├── src/
│   ├── server.ts                  # buildServer(): plugins, route registration, error handler, GET /up
│   ├── auth.ts                    # better-auth instance (Drizzle adapter, bcrypt hasher; no 2FA)
│   ├── config/env.ts              # Zod-validated environment contract, parsed once at boot
│   ├── db/
│   │   ├── schema.ts              # Drizzle tables. Auth/RBAC: users, accounts, sessions,
│   │   │                          # verifications, two_factors, roles, permissions,
│   │   │                          # role_permissions, user_roles, businesses.
│   │   │                          # Shop: categories, products, product_images,
│   │   │                          # product_variants, price_tiers, promotions,
│   │   │                          # promotion_items, coupons, customers, orders, order_items
│   │   ├── client.ts, migrate.ts  # pool + drizzle instance; runtime migrator (no drizzle-kit in prod)
│   │   ├── seed.ts                # PERMISSION_KEYS, ROLE_DEFAULTS, seedRbac()
│   │   └── seed-dev.ts            # user fixtures + demo catalog for dev and the test suite (non-prod)
│   ├── routes/                    # auth, users, businesses, dashboard, me, permissions, profile,
│   │                              # categories, products, promotions, orders, coupons, customers,
│   │                              # reports, public (the storefront API)
│   ├── services/                  # users, business, user-guards, categories, products, promotions,
│   │                              # orders, customers, storefront, and the domain core:
│   │                              # pricing, order-creator, order-canceller, coupon-applier,
│   │                              # whatsapp-message (pure and testable wherever possible)
│   ├── middleware/                # authorize (requireAuth/requirePermission), rate-limit,
│   │                              # store-published (503 when the shop unpublishes)
│   ├── jobs/                      # queue (pg-boss + enqueueEmail/enqueueOrderNotification),
│   │                              # handlers, worker entrypoint
│   ├── emails/                    # mailer (nodemailer), layout, send (Spanish templates)
│   └── lib/                       # response envelope, serializers, validation, session, password,
│                                  # auth-errors, export (xlsx), storage (R2), ids,
│                                  # money (integer cents — see §11), slug, images (sharp/WebP),
│                                  # multipart (Rails bracket notation)
├── scripts/
│   ├── console.ts                 # interactive REPL (bin/rails console equivalent)
│   ├── create-admin.ts            # first administrator of a deployment
│   └── migrate-from-rails.ts      # one-way Rodauth -> better-auth data migration
├── drizzle/                       # generated SQL migrations + journal
└── test/                          # node:test, 219 tests
```

### Object storage instead of Active Storage

There are no attachment tables. The R2 object key lives on the row that owns it:
`businesses.logo_key`, `categories.image_key`, `products.image_key` / `video_key`,
`product_images.file_key`, `promotions.image_key`, `orders.payment_proof_key`.
`uploadAsset()` in `lib/storage.ts` writes them and `assetUrl()` in `lib/serializers.ts`
reads them back. Images are re-encoded to WebP by `lib/images.ts` (sharp, max 1600px,
quality 82); product, gallery and promotion images are flattened onto white while
category icons and the logo keep their alpha. **Videos and payment receipts are stored
as sent** — re-encoding a bank screenshot can cost the shop the digits it needs to read.

### Response shape (`api/src/lib/response.ts`)

```ts
ok(reply, { users, pagination });
fail(reply, "Usuario no encontrado", 404);
```
```json
{ "status": "success", "api_version": "v1", ...data }
{ "status": "error", "message": "...", "errors": [], "api_version": "v1" }
```
`api_version` is emitted on **every** response, including permission failures — Rails omitted it there.

### Backend pitfalls

| Pitfall                                       | Rule                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| Missing `requirePermission`                    | All data-modifying endpoints MUST check permissions                     |
| English error messages to users                | All user-facing messages MUST be in Spanish (§3)                        |
| Hand-rolled response objects                   | Always use `ok`/`fail` so the envelope stays consistent                 |
| Re-deriving permissions by hand                | Go through `replaceRoles` / `loadAuthorization` in `services` (§4, §6)  |
| Assuming Bearer/JWT auth                       | Auth is cookie-based — don't add `Authorization: Bearer` handling       |
| Rate limits at `onRequest`                     | Email-keyed policies need `preHandler`; at `onRequest` `request.body` is undefined and they silently collapse onto the IP fallback |
| TypeScript Node cannot strip                   | No enums, no decorators, no parameter properties — `tsc --noEmit` rejects them |
| `parseFloat` on a money column                 | `numeric(10,2)` comes back as a **string**. All arithmetic goes through `lib/money.ts` (§11) |
| Trusting a price from the client               | `createOrder` re-reads every price from the database and freezes it onto the line |
| `z.coerce.boolean()` on a multipart field      | `Boolean("false")` is `true`. Use `booleanInput` from `lib/validation.ts` |
| Reading a multipart field as a flat key        | The admin sends `category[name]`; `readMultipart` expands it, then `unwrap(body, "category")` |
| Leaking `orders.public_token` through the admin | It authorises the buyer's confirmation page. It must never appear in an admin serializer |
| Leaking `notification_email` through `/public` | It is the owner's inbox; that payload is read by the buyer's browser |

---

## 8. Frontend — React Admin SPA

### Directory structure (current)

```
admin/src/
├── main.tsx, routes/index.tsx (createBrowserRouter)
├── layouts/RootLayout.tsx, AuthLayout.tsx, DashboardLayout.tsx
├── pages/
│   ├── auth/            # SignIn, SignUp, Confirm, VerifyEmail, Forgot/ResetPassword
│   ├── dashboard/        # Dashboard.tsx, business/BusinessSettings.tsx, components/ (page-local widgets), users/
│   ├── errors/NotFound.tsx
│   └── root/Home.tsx
├── stores/               # authStore, businessStore, dashboardStore, profileStore, userStore
├── components/
│   ├── ui/                # shadcn/ui primitives — DO NOT edit manually, use `npx shadcn@latest add`
│   ├── common/, shared/, navigation/AppSidebar.tsx, routing/ProtectedRoute.tsx, users/, errors/
│   └── AreaChart.tsx, ComboChart.tsx, DonutChart.tsx   # loose chart components, not in a subfolder
├── hooks/, types/auth.ts, utils/api.ts, lib/
```

### Routing (`routes/index.tsx` + `ProtectedRoute.tsx`)

- `/auth/*`, `/identity/*` → `AuthLayout`, unprotected.
- Self-service registration is **disabled** (internal software): `/auth/signup` redirects to `/auth/signin` and the link is gone from the sign-in page. `AuthSignUp.tsx` and `POST /api/v1/auth/sign-up/email` still exist — re-add the route + link to re-enable.
- `/dashboard` → `DashboardLayout`; `index` (Dashboard) is reachable to any authenticated user; `users` and `settings` are wrapped in `<ProtectedRoute requiredPermission={...}>`.
- `ProtectedRoute` accepts `requiredPermission: PermissionKey | PermissionKey[]` (array = **OR** via `hasAnyPermission`), falls back to legacy `requiredRoles`, redirects unauthenticated users to `/auth/signin` and authenticated-but-unauthorized users to `/dashboard` (not to login) with a toast.
- Every top-level route branch has `errorElement: <ErrorBoundary />`.

### Navigation pattern — reference: `admin/src/components/navigation/AppSidebar.tsx`

Permission checks happen in the **parent** (`DashboardLayout.tsx`, e.g. `hasPermission(Permissions.VIEW_USERS)`) and are passed down as plain booleans (`canManageUsers`) — `AppSidebar` itself doesn't call `hasPermission`. Follow this pattern for new sidebar sections: resolve visibility in the layout, pass a boolean prop down. Collapsible groups (e.g. "Configuración") fall back to a `DropdownMenu` when the sidebar is icon-collapsed, so sub-items stay reachable. Active-state styling is centralized in the `activeMenuClasses` constant — reuse it rather than inlining new active-state classes.

### CRUD pattern — reference: `admin/src/pages/dashboard/users/`

New CRUD resources should follow this shape unless there's a good reason not to:
- **One routed "index" page** (`UsersIndex.tsx`) — owns a `useReducer` tracking which modal is open (`createModalOpen`, `updateModalOpen`, `deleteModalOpen`, etc.), renders a TanStack Table, and conditionally renders the create/update/delete components inline.
- **Create/Update as shadcn `Dialog`s**, **Delete as a destructive shadcn `AlertDialog`** (require re-typing the resource's name to confirm) — not separate routes.
- Gate actions with `hasPermission`/`hasRole` from `useAuthStore()`, preferring the `Permissions.X` constant (see §6 note on the one pre-existing exception in this exact folder).
- Store logic lives in the matching Zustand store (`useUserStore` for this example), not in the components.

### State management (Zustand)

Every store: `isLoading`, `error`, `try/catch` on all API calls, Spanish error messages, explicit handling for 401/403/404/422/429/500 and "no response" (network) cases.

### Frontend pitfalls

| Pitfall                                  | Rule                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| Editing `components/ui/*` directly        | Use `npx shadcn@latest add <component>` — manual edits get overwritten |
| Forgetting 429 in store error handling    | Every API call MUST handle rate-limit errors                     |
| Raw permission strings in new code        | Use the `Permissions.X` constant, not `"edit_users"` literals    |
| Adding routes without protection          | Wrap with `<ProtectedRoute requiredPermission={...}>`            |
| English user-facing text                  | All labels, messages, toasts MUST be in Spanish                  |
| Numeric user ids                          | better-auth issues text ids — `user.id` is a `string` (domain ids in `types/store.ts` stay numeric) |
| Setting `Content-Type` on a `FormData` body | The boundary is part of it. `utils/api.ts` strips the header; don't re-add it |
| Rendering only the envelope's `message` on a 422 | `apiErrorMessage` prefers the `errors` array — that is where the specific reason lives |

**Testing/lint status (current, don't assume otherwise)**: ESLint (flat config) is active via `bun run lint` — currently 0 errors and 5 warnings, all pre-existing (`react-refresh/only-export-components` in shadcn primitives, one `exhaustive-deps`). **No Prettier**, **no frontend test runner** configured (no `test` script, no Vitest/Jest) — don't reference frontend tests that don't exist. The storefront has no test runner either; verify it by driving it (§9).

---

## 9. Infrastructure — Docker

Dev stack (`docker-compose.dev.yml`): `admin`, `api`, `worker` (pg-boss), `storefront`, `postgres`, `mailpit`. Prod (`docker-compose.yml`): `admin`, `api`, `worker`, `storefront` — Postgres is external, managed separately (Dokploy).

Both compose files start the api with `db:deploy && db:seed` — the runtime migrator plus the idempotent RBAC seed, replacing Rails' `db:prepare`. Dependencies are baked into the image; nothing is installed at container start.

### Two traps already paid for in production

**1. Never point an internal URL at a compose *service* name.** On a shared network
(`dokploy-network`) Docker registers the service name as a DNS alias, so a second
client's stack registers `api` and `postgres` too — Docker then round-robins between
stacks, which surfaces as intermittent 403s served by *someone else's* API. Every
service therefore carries `container_name: ${STACK_NAME:-rystore}-<service>`, and
`API_INTERNAL_URL` / `DB_HOST` must point at that container name. Traefik router and
service labels are stack-scoped for the same reason. Change `STACK_NAME` per client.

**2. `PUBLIC_API_URL` and `VITE_*` must be build args, not just runtime env.** Astro
inlines `PUBLIC_*` and Vite inlines `VITE_*` into the client bundle **at build time**.
Setting them only at runtime leaves the checkout calling an empty origin. Both
Dockerfiles declare them as `ARG`; both compose files pass them under `build.args`.

Key env vars (see `.env.example` for the full list): `DB_*` (they configure both the `postgres` service and the API's `DATABASE_URL`, so each value has exactly one name), `ADMIN_FRONTEND_URL`/`ADMIN_ALLOWED_ORIGINS`, `STOREFRONT_URL` (the CORS origin for `/api/v1/public/*`), `API_INTERNAL_URL` and `PUBLIC_API_URL` (see trap 1 and 2), `STACK_NAME`, `SMTP_*`, `CLOUDFLARE_*` (R2 storage), `APP_NAME` (brand shown in transactional email and as the better-auth appName), `SECRET_KEY_BASE` (**minimum 32 characters — the API refuses to boot below that**; generate with `openssl rand -hex 64`).

```bash
# Common operations
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml logs -f api
docker compose -f docker-compose.dev.yml exec api npm run db:generate   # new migration from schema.ts
docker compose -f docker-compose.dev.yml exec api npm run db:deploy     # apply migrations
docker compose -f docker-compose.dev.yml exec api npm run create-admin  # first administrator
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # local user fixtures (non-prod)
docker compose -f docker-compose.dev.yml exec api npm run console        # interactive REPL
```

### End-to-end checks the test suite cannot cover

```bash
# 1. The WhatsApp preview — the storefront's whole reason to be server-rendered.
curl -A "WhatsApp/2.23" http://localhost:4321/producto/demo-camiseta | grep 'og:'

# 2. A real checkout: two additions of the same product must cross the wholesale
#    tier together, and a combo must come through as one line with its contents.
#    Confirm order_items.unit_price froze the tier price and that stock dropped
#    for the loose line *and* the combo's parts.
docker compose -f docker-compose.dev.yml exec api npm run console

# 3. Receipt upload from /pedido/<token>, then check Mailpit (:8025) for
#    "Comprobante recibido" and R2 for the object under orders/<id>/.

# 4. Set businesses.published = false: /public/products must 503 while
#    /public/store and /public/orders/<token> stay 200, and the storefront home
#    must render its "Cerrado" page instead of the catalog.

# 5. Sign in as operator@example.com: Pedidos and Catálogo visible, Cupones,
#    Contactos, Reportes and Usuarios not.
```

### Console

`npm run console` (`api/scripts/console.ts`) is the replacement for `bin/rails console` — a plain Node REPL (`node:repl`, no dependency) with `db`, the Drizzle schema tables, the query helpers (`eq`, `and`, …), and the service layer preloaded. Top-level `await` works at the prompt. It connects to whatever `DATABASE_URL` resolves to, so run it through `docker compose exec` to hit the dev database, and treat a production connection as production — there is no undo.

### First administrator

A fresh database has roles and permissions but no users, and every route except `GET /api/v1/public/business` needs a session. `npm run create-admin` creates one, reading `ADMIN_EMAIL`/`ADMIN_PASSWORD` (an unset password is generated and printed once). It is idempotent: re-running against an existing email only grants the admin role. `setup.sh` offers to run it when the users table is empty.

### Migrating a deployment off Rails

For client servers that already hold Rodauth data, `api/scripts/migrate-from-rails.ts` copies users, verification state, roles and the business row into the new schema. It is additive, idempotent, and never writes to the Rails database, so a failed run can be retried:

```bash
docker compose -f docker-compose.dev.yml exec \
  -e RAILS_DATABASE_URL=postgres://user:pass@postgres:5432/rails_api_development \
  api npm run migrate:from-rails -- --dry-run
```

Fresh installs don't need it.

---

## 10. Testing (backend)

`node:test` (Node's built-in runner) — no Jest, no Vitest. 219 tests in `api/test/`, covering the seams most likely to break:

| File | Covers |
| ---- | ------ |
| `order-creator.test.ts` | The irreplaceable block: totals from database prices, merged lines crossing a tier together, variants summing into the ladder, combos as one line, stock checked against the whole cart, nothing persisted when the customer is invalid |
| `money.test.ts` | Rounding and accumulation in integer cents (§11) |
| `public-storefront.test.ts` | Catalog filters and sorting, the unpublished 503 and its exemptions, `notification_email` and `public_token` never leaking |
| `catalog-endpoints.test.ts`, `product-rules.test.ts` | Price-tier / option / variant / combo validation, and variant id preservation across a save |
| `sales-endpoints.test.ts` | Orders, coupons, contacts through the real router |
| `reports.test.ts` | Date ranges, CSV quoting, the coupon report's deliberate asymmetry, the commerce dashboard |
| `order-notification.test.ts` | The two shop emails, delivered against Mailpit |
| `multipart.test.ts` | Bracket-notation expansion and multipart booleans |
| `auth.test.ts`, `authorize.test.ts`, `user-guards.test.ts`, `endpoints.test.ts`, `jobs.test.ts`, `whatsapp-message.test.ts` | The template's own seams |

Tests run against the live database and expect the fixtures from
`npm run db:seed:dev`: users (`admin`/`manager`/`operator`/`user`/`unverified`
`@example.com`, all `password123`) **and a demo catalog** — `demo-camiseta` (10.00, a
ladder at 6 → 9.00 and 12 → 8.00, 100 units), `demo-zapato` (two variant axes, the 39
priced on its own), `demo-asesoria` (a service), `demo-sticker` (untracked stock),
`demo-combo-basico` and three coupons. Tests that draw stock down restore it in their
`after` hook, so the suite is repeatable. The dev compose command runs that seed on every
start, so a normal `setup.sh` covers it; re-run it by hand if the tables were cleared.
Run the suite in the container:

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # once, if needed
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
docker compose -f docker-compose.dev.yml exec api npm run typecheck
```

---

## 11. Money and pricing rules

This is the part most easily broken by a well-meaning change. All of it is enforced in
`api/src/services/` and pinned by `test/order-creator.test.ts`.

**Arithmetic is integer cents.** Money columns are `numeric(10,2)` and the driver returns
them as **strings**. `parseFloat` and `+` drift within a few operations. Everything goes
through `api/src/lib/money.ts` (`toCents` → `bigint`, `addCents`, `multiplyCents`,
`percentOfCents`, `fromCents` → string), which is the replacement for Ruby's `BigDecimal`.

**The server recomputes every price.** `createOrder` ignores any price the client sends,
re-reads each product inside the transaction, and freezes the result onto `order_items`
along with `product_name`, `variant_label` and `details`. A past order is never
recalculated — deleting a tier, a variant or a whole product does not rewrite it.

**The wholesale ladder applies to the merged quantity.** Duplicate cart lines are merged
first, so adding 3 units and then 3 more qualifies for the "from 6" tier *together*.
`tierQuantities` sums a product's quantity **across its variants** (S×5 + M×5 = 10 for the
tier) and **excludes combos on purpose** — a combo is already discounted, and counting its
contents would discount them twice.

**A variant with its own price opts out of the ladder entirely.**

**`stock IS NULL` means the shop does not track inventory** for that row: it never blocks
a checkout and is never decremented. Availability is validated against the demand of the
*whole cart*, including what the combos consume.

**A combo is one line** at its own price, with `details = contents_label` and **no
`product_id`**; its parts are decremented from stock individually. Its price may never
exceed the sum of its parts at list price.

**`orders.public_token`** (random) authorises the buyer's confirmation page and the
receipt upload. **`number` (`RY-00001`) authorises nothing** — it is sequential and
guessable — and `public_token` must never appear in an admin serializer.

**Cancelling restores stock but does not refund `coupons.usage_count`.** That is
deliberate: refunding it would let someone drain a limited promo by ordering and
cancelling in a loop. It is also why `/reports/coupons` counts cancelled orders while
every other report excludes them.

---

## 12. Storefront — Astro SSR

The shop the buyer sees. Server-rendered on every request (§1), unauthenticated, and the
only consumer of `/api/v1/public/*`.

```
storefront/src/
├── pages/               # index (catalog), producto/[slug], carrito, checkout,
│                        # pedido/[token], 404, sitemap.xml.ts, robots.txt.ts
├── layouts/StoreLayout.astro     # the shell — and where the og: tags are emitted
├── components/
│   ├── astro/            # Header, Footer, SocialFloat, StoreClosed (server-only)
│   └── islands/          # React, hydrated client-side: Catalog, ProductGallery,
│                         # AddToCart, CartPage, CheckoutForm, PaymentProofUpload…
├── lib/                  # api.ts (the two base URLs), cart.ts, pricing.ts, format.ts
└── types/store.ts        # mirrors the API's public payloads — keep in sync
```

**Two base URLs, on purpose** (`lib/api.ts`). `serverFetch` uses `API_INTERNAL_URL` and
runs during SSR over the compose network — no CORS, never leaves the host. `browserFetch`
uses `PUBLIC_API_URL` and runs in the buyer's browser. Mixing them fails in ways that are
annoying to debug: an internal container hostname handed to an island resolves to nothing.
Anything the buyer triggers (checkout, coupon preview, cancel, receipt upload) must go
through `browserFetch`; anything rendered into the HTML through `serverFetch`.

**The API, not the storefront, enforces the published gate.** A storefront-only check
would leave the whole catalog readable straight from the API while the shop believes it is
offline, and crawlers would keep indexing it. When `/public/products` answers 503 the
storefront renders `StoreClosed.astro`; `/public/store` and an existing
`/public/orders/<token>` stay reachable so a closed shop still shows its name and a buyer
who already paid keeps their confirmation page.

**Reads from private addresses skip the rate limit.** `isInternalStorefrontRead` in
`api/src/middleware/rate-limit.ts` exempts GETs to `/api/v1/public/*` coming from private
IPs — without it every visitor shares the SSR container's single bucket of 300. Checkout
(`POST /public/orders`) keeps its own limit of 20/hour per IP.

There is no test runner here. Verify it by driving it — see the end-to-end checks in §9.
