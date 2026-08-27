# AGENTS.md — React + Fastify Stack

> Canonical instructions for any AI coding assistant working on this repo (Claude Code, OpenCode, GitHub Copilot, etc.). `CLAUDE.md` and `.github/copilot-instructions.md` point here — edit **this** file, not those.
>
> Section numbers are cited from code comments (`AGENTS.md §4`). Renumbering breaks those references — repurpose a section rather than deleting it.

---

## 1. Stack Overview

| Layer        | Tech                                                        | Port (dev)          |
| ------------ | ------------------------------------------------------------ | -------------------- |
| **Frontend** | React 19, TypeScript 5.7, Vite 6, TailwindCSS 4, Shadcn/ui   | 5173                  |
| **Backend**  | Fastify 5, better-auth, Drizzle ORM, Zod (Node 24, TypeScript) | 3000                |
| **Worker**   | pg-boss (`npm run worker`, same codebase, separate `worker` container) | — (jobs only) |
| **Database** | PostgreSQL 16                                                 | 5432 (internal only) |
| **Queue**    | pg-boss, in its own schema on the same Postgres — no Redis, no extra service | — |
| **Email (dev)** | Mailpit (in-browser SMTP inbox)                            | 8025                  |

Node 24 runs TypeScript directly via type stripping, so **there is no build step and no compiler in the production image**. `erasableSyntaxOnly` in `api/tsconfig.json` makes `tsc --noEmit` reject syntax Node cannot strip (enums, parameter properties, decorators) at typecheck time rather than at runtime. Import paths carry the `.ts` extension for the same reason.

There is **no storefront app** and no mobile app in this repo — both were removed along with their related compose services, env vars, and docs. Don't recreate them unless explicitly asked.

The project is distributed **self-hosted, single-tenant per client** via Docker Compose — each deployment serves one client, low traffic, exactly one row in `businesses`. Design decisions favor simplicity over scale.

---

## 2. Repository Layout

```
REACT-RAILS-Stack/
├── admin/                       # React 19 admin SPA (Vite + Bun)
├── api/                         # Fastify API + pg-boss worker (Node 24, TypeScript)
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

The repository name still says RAILS. The Rails backend was migrated to Fastify over eight phases (`git log --grep "migration phase"`) and deleted in phase 8; the name is the only thing left of it.

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
| `send-email`               | All transactional mail (verification, reset, admin invitation)      | on demand |
| `cleanup-verifications`    | Expired rows in better-auth's `verifications`        | hourly (`0 * * * *`) |
| `cleanup-sessions`         | Expired sessions — better-auth leaves them in place | daily (`30 3 * * *`) |

Mail is queued rather than sent inline so a transient SMTP failure is retried with backoff instead of costing a user their invitation. Queue creation is **sequential**: `create_queue` takes a `ShareRowExclusiveLock` on the same partitioned table, so concurrent creation deadlocks on startup.

Licensing used to live in this section. It was removed entirely in migration phase 3 at the owner's request: no verifier, no global hook, no `license/status` endpoint, no 402 responses, no `LICENSE_KEY`. Client deployments are not time-gated. **Don't reintroduce it without being asked.**

---

## 6. RBAC — Roles & Permissions

9 permission keys, defined in `api/src/db/seed.ts` (`PERMISSION_KEYS`) and mirrored in `admin/src/types/auth.ts` (`Permissions` const — must stay in sync):

`view_dashboard`, `view_users`, `create_users`, `edit_users`, `delete_users`, `export_users`, `view_business`, `edit_business`, `edit_profile`.

Default role → permission mapping (`ROLE_DEFAULTS`, applied by `seedRbac()`, which is idempotent and runs on every container start):

| Role         | Permissions                                    |
| ------------ | ----------------------------------------------- |
| **admin**    | All 9                                            |
| **manager**  | All 9 (currently identical to admin)             |
| **operator** | `view_dashboard`, `edit_profile` only            |
| **user**     | `edit_profile` only                              |

Admin and manager are currently identical: same permissions, and login is one step for both (§4).

Note: `edit_business` is defined but has no current frontend call site (only `view_business` is checked) — if you add business-editing UI, gate it on `Permissions.EDIT_BUSINESS`.

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
│   │   ├── schema.ts              # Drizzle tables (users, accounts, sessions, verifications,
│   │   │                          # two_factors, roles, permissions, role_permissions,
│   │   │                          # user_roles, businesses)
│   │   ├── client.ts, migrate.ts  # pool + drizzle instance; runtime migrator (no drizzle-kit in prod)
│   │   ├── seed.ts                # PERMISSION_KEYS, ROLE_DEFAULTS, seedRbac()
│   │   └── seed-dev.ts            # local user fixtures for dev + the test suite (non-prod)
│   ├── routes/                    # auth, users, businesses, dashboard, me, permissions, profile, public
│   ├── services/                  # users, business, user-guards (pure, testable business rules)
│   ├── middleware/                # authorize (requireAuth/requirePermission), rate-limit
│   ├── jobs/                      # queue (pg-boss + enqueueEmail), handlers, worker entrypoint
│   ├── emails/                    # mailer (nodemailer), layout, send (Spanish templates)
│   └── lib/                       # response envelope, serializers, validation, session, password,
│                                  # auth-errors, export (xlsx), storage (R2), ids
├── scripts/
│   ├── console.ts                 # interactive REPL (bin/rails console equivalent)
│   ├── create-admin.ts            # first administrator of a deployment
│   └── migrate-from-rails.ts      # one-way Rodauth -> better-auth data migration
├── drizzle/                       # generated SQL migrations + journal
└── test/                          # node:test, 50 tests
```

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
| Numeric user ids                          | better-auth issues text ids — `user.id` is a `string`            |

**Testing/lint status (current, don't assume otherwise)**: ESLint (flat config) is active via `bun run lint`. **No Prettier**, **no frontend test runner** configured (no `test` script, no Vitest/Jest) — don't reference frontend tests that don't exist.

---

## 9. Infrastructure — Docker

Dev stack (`docker-compose.dev.yml`): `admin`, `api`, `worker` (pg-boss), `postgres`, `mailpit`. Prod (`docker-compose.yml`): `admin`, `api`, `worker` — Postgres is external, managed separately (Dokploy). No `storefront` service in either file.

Both compose files start the api with `db:deploy && db:seed` — the runtime migrator plus the idempotent RBAC seed, replacing Rails' `db:prepare`. Dependencies are baked into the image; nothing is installed at container start.

Key env vars (see `.env.example` for the full list): `DB_*` (they configure both the `postgres` service and the API's `DATABASE_URL`, so each value has exactly one name), `ADMIN_FRONTEND_URL`/`ADMIN_ALLOWED_ORIGINS`, `SMTP_*`, `CLOUDFLARE_*` (R2 storage), `APP_NAME` (brand shown in transactional email and as the better-auth appName; defaults to `R&R Template`), `SECRET_KEY_BASE` (**minimum 32 characters — the API refuses to boot below that**; generate with `openssl rand -hex 64`).

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

`node:test` (Node's built-in runner) — no Jest, no Vitest. 50 tests in `api/test/`, covering the seams most likely to break: bcrypt compatibility with Rodauth hashes, the Spanish translation layer, single-step login, the authorization middleware, the user guards, and endpoint coverage through the real router with a real session cookie.

Tests run against the live database and expect the fixture users from
`npm run db:seed:dev` (`admin`/`manager`/`operator`/`user`/`unverified` `@example.com`,
all `password123`). The dev compose command runs that seed on every start, so a
normal `setup.sh` covers it; re-run it by hand if the users table was cleared.
Run the suite in the container:

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # once, if needed
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
docker compose -f docker-compose.dev.yml exec api npm run typecheck
```
