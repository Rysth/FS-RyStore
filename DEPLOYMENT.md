# Deployment Guide — Dokploy

How to deploy RyStore on a Dokploy VPS, and how to add a second client
deployment on the same server later.

Each deployment is **self-hosted and single-tenant**: one client, one
database, one `businesses` row, three web-facing services (**admin**, **api**,
**storefront**) plus a background **worker**. `docker-compose.yml` is the
production compose file; `docker-compose.dev.yml` is for local development
only.

Worked example throughout this guide: **RysthShop**, on `rysthdesign.com`,
using Dokploy's own managed PostgreSQL.

---

## Before you start

You need, in order:

1. **DNS records** for three subdomains, all pointed at your Dokploy VPS —
   either an `A` record to the server's IP, or a `CNAME` to your Dokploy
   host's own domain (however you already point other apps at it):
   - `admin.rysthdesign.com` — the shop owner's panel
   - `tienda.rysthdesign.com` — the storefront the buyer sees
   - `api.tienda.rysthdesign.com` — the API both of them talk to

   DNS has to resolve **before** you deploy, or Traefik's Let's Encrypt
   request for the certificate fails.

2. **A Cloudflare R2 bucket** (endpoint, access key, secret key, bucket name).
   Optional to launch — the API boots fine without it — but every image
   upload (product photos, the shop's logo, payment receipts) answers
   "El almacenamiento de archivos no está configurado" until it's set.

3. **Real SMTP credentials.** Optional to launch too — login itself needs no
   mail — but without it, the "nuevo pedido" email to the shop and
   password-reset mail silently fail (the `worker` container logs the error;
   nothing crashes). WhatsApp is still the primary channel a new order
   reaches the shop through, so this is not launch-blocking, just worth
   fixing soon after.

4. **A unique `SECRET_KEY_BASE`** per deployment: `openssl rand -hex 64`.
   Never reuse one between clients — it signs session cookies.

---

## Step 1 — Create the database

In your Dokploy project, **+ Create Service → Database → PostgreSQL**. Give
it a name, a user and a strong password, and create it.

Once it's running, open its detail page and copy the **internal host** and
**port** Dokploy shows you — that's what goes into `DB_HOST`/`DB_PORT` below.
Don't guess a hostname; use exactly what Dokploy displays.

`docker-compose.yml` hard-codes the Postgres port as `5432` in the
connection string it builds. If Dokploy's internal port for your database
isn't `5432`, edit the two `DATABASE_URL` lines in `docker-compose.yml`
before deploying (search for `:5432`).

---

## Step 2 — Create the Compose service

**+ Create Service → Compose**, point it at your git repository and branch
(`main`), and set the compose path to `docker-compose.yml` — the production
one, not `docker-compose.dev.yml`.

---

## Step 3 — Environment variables

Paste this into Dokploy's **Environment** tab for the Compose service, filled
in for RysthShop. Replace the `<...>` placeholders with your own values.

```env
NODE_ENV=production
APP_NAME=RysthShop

# Prefixes every container_name and Traefik router with this, so this stack
# never collides with your other Dokploy projects on the same VPS. Pick
# something specific to this client — not the generic "rystore".
STACK_NAME=rysthshop

# ── Database — from Step 1 ──────────────────────────────────────────
DB_HOST=<host que te mostró Dokploy>
DB_USER=<el usuario que creaste>
DB_PASSWORD=<esa contraseña>
DB_NAME=<el nombre de la base>

# ── Admin panel ──────────────────────────────────────────────────────
ADMIN_FRONTEND_URL=https://admin.rysthdesign.com
ADMIN_ALLOWED_ORIGINS=https://admin.rysthdesign.com
VITE_API_URL=https://api.tienda.rysthdesign.com

# ── Storefront ───────────────────────────────────────────────────────
STOREFRONT_URL=https://tienda.rysthdesign.com
# Baked into the storefront's client bundle at build time (Astro inlines
# PUBLIC_*), which is why it's also a build arg in docker-compose.yml —
# setting it only here would leave the checkout calling an empty origin.
PUBLIC_API_URL=https://api.tienda.rysthdesign.com
# The container name, never the bare service name "api": on a VPS that
# hosts several client stacks, Docker can register "api" as an alias
# shared between them, and traffic round-robins between two different
# clients' APIs. Must match STACK_NAME above.
API_INTERNAL_URL=http://rysthshop-api:3000

# ── Secret ───────────────────────────────────────────────────────────
# openssl rand -hex 64 — unique per deployment, minimum 32 characters.
SECRET_KEY_BASE=<pega aquí el resultado>

# ── SMTP (optional to launch — see "Before you start") ──────────────
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# ── Cloudflare R2 (optional to launch) ───────────────────────────────
CLOUDFLARE_ENDPOINT=
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_BUCKET_NAME=

# ── Traefik domains, read by docker-compose.yml's labels ────────────
ADMIN_SERVER_NAME=admin.rysthdesign.com
API_SERVER_NAME=api.tienda.rysthdesign.com
STOREFRONT_SERVER_NAME=tienda.rysthdesign.com
```

The API validates its whole environment with Zod at boot
(`api/src/config/env.ts`), so a misconfigured deployment fails immediately
and names the offending variable rather than breaking at the first request
that needs it — check the `api` container's logs first if it won't stay up.

---

## Step 4 — Domains

`docker-compose.yml` already carries Traefik labels for `admin`, `api` and
`storefront`, driven by the `*_SERVER_NAME` variables above — Dokploy's
Traefik picks them up automatically once the stack is on its shared network,
which a Compose deployment joins on its own. You should not need to touch
anything in Dokploy's own **Domains** tab for this to work; if a route
doesn't come up after deploying, that tab is also where you can add the same
three domains by hand (host + the container's internal port — `5173` for
admin, `3000` for api, `4321` for storefront) as a fallback, and Dokploy will
configure Traefik for you directly.

Either way, Let's Encrypt only issues a certificate once DNS for that domain
actually resolves to this server — if a domain was added to Dokploy or your
DNS provider within the last few minutes, give it a little longer before
assuming something is broken.

---

## Step 5 — Deploy

Click **Deploy**. Dokploy builds all four images and starts the stack. The
`api` container applies migrations and seeds roles and permissions before it
starts listening — `worker`, `admin` and `storefront` all wait on its
healthcheck (`GET /up`), so a passing deploy means the database is already
in the right shape.

```bash
# From Dokploy's own terminal for the api service, or docker exec on the VPS
curl https://api.tienda.rysthdesign.com/up
# {"status":"ok","database":"ok"}
```

---

## Step 6 — Create the first administrator

A fresh database has roles and permissions but no users, and every route
except the public storefront ones needs a session:

```bash
ADMIN_EMAIL=tucorreo@rysthdesign.com npm run create-admin
```

Run inside the `api` container (Dokploy's terminal tab, or
`docker exec -it rysthshop-api sh` on the VPS). With no `ADMIN_PASSWORD`
set, a strong one is generated and printed **once** — save it before closing
the terminal. The command is idempotent: run again against the same email,
it only grants the admin role and leaves the password alone.

Login is a single step for every role, so a working SMTP server is not
required to sign in.

---

## Step 7 — Verify

```bash
# The three services answer
curl -I https://admin.rysthdesign.com
curl -I https://tienda.rysthdesign.com
curl https://api.tienda.rysthdesign.com/up

# WhatsApp reads Open Graph tags from the initial HTML — this is the whole
# reason the storefront is server-rendered. Seed a product first if the
# catalog is still empty.
curl -A "WhatsApp/2.23" https://tienda.rysthdesign.com/producto/<slug> | grep 'og:'
```

Then, from the admin panel: sign in, set up the business (Ajustes → Tienda),
add a category and a product, and place one real order through the
storefront to confirm the whole path — checkout, stock decrement, the order
showing up in Pedidos, and (once SMTP is configured) the "nuevo pedido"
email arriving.

---

## Database Migrations

### Automatic execution

Migrations run automatically on every deploy, from this line in
`docker-compose.yml`:

```yaml
command: sh -c "npm run db:deploy && npm run db:seed && exec node src/server.ts"
```

`db:deploy` uses drizzle-orm's runtime migrator rather than the
`drizzle-kit` CLI — it only needs the SQL files and the journal under
`api/drizzle/`, both copied into the image, so it has no dependency on
`drizzle-kit` landing in the production `node_modules`.

### Changing the schema

1. Edit `api/src/db/schema.ts`.
2. Generate the migration: `docker compose -f docker-compose.dev.yml exec api npm run db:generate`
3. Commit the schema change **and** the generated files under `api/drizzle/`.
4. Push to `main` and redeploy in Dokploy — the new migration applies on
   the next `api` container start.

Drizzle has no rollback command. To undo a migration, write a new one that
reverses it.

---

## Adding a second client on the same VPS

This is the point of `STACK_NAME`: create a new Dokploy project, a new
database, and a new Compose service pointed at the same repository (or a
fork of it), with its own `.env` — different `STACK_NAME`, different
domains, its own `SECRET_KEY_BASE`, its own database. Nothing in
`docker-compose.yml` needs editing; every container name and Traefik router
is already parameterized by `STACK_NAME`.

The one rule that matters here: **never point `API_INTERNAL_URL` or
`DB_HOST` at a bare service name** (`api`, `postgres`) instead of the full
`container_name`. Dokploy's shared network gives every stack's `api`
service the same short alias, and Docker round-robins between them — one
client's storefront ends up talking to a *different* client's API,
intermittently. `API_INTERNAL_URL` above already uses
`${STACK_NAME}-api`; keep that pattern for every deployment.

---

## Troubleshooting

1. **`api` container restarts immediately:** check its logs — the Zod env
   validation prints exactly which variable is wrong. A `SECRET_KEY_BASE`
   under 32 characters, or a `DATABASE_URL` that can't reach the database,
   are the usual causes.
2. **A domain doesn't resolve to a certificate / 404 from Traefik:** DNS
   hasn't propagated yet, or the `*_SERVER_NAME` variable doesn't exactly
   match the DNS record. Re-check both.
3. **The admin loads but every request fails / CORS errors in the browser
   console:** `VITE_API_URL` and `ADMIN_ALLOWED_ORIGINS` have to agree —
   the first is what the browser calls, the second is what the API accepts
   calls from. Same pattern for `STOREFRONT_URL` and `PUBLIC_API_URL` on
   the storefront side.
4. **Checkout on the storefront fails to reach the API, or images never
   load:** `PUBLIC_API_URL` is baked into the storefront's bundle at
   **build** time (Astro inlines `PUBLIC_*`). If you only set it at
   runtime and didn't rebuild, the old value is still what shipped —
   redeploy so the build step picks it up.
5. **Image upload fails with "El almacenamiento de archivos no está
   configurado":** the four `CLOUDFLARE_*` variables are unset. Fill them
   in and redeploy.
6. **Password-reset or "nuevo pedido" mail never arrives:** SMTP is
   unconfigured or wrong. Check the `worker` container's logs — mail is
   queued, so a failure shows up there, not in the `api` logs.
7. **A storefront request lands on the wrong client's API (intermittent
   403s or unrelated data):** `API_INTERNAL_URL` or `DB_HOST` is pointed at
   a bare service name instead of a `container_name` — see "Adding a
   second client" above.

### Debug commands

```bash
# Health check
curl https://api.tienda.rysthdesign.com/up

# Logs (from the VPS, or Dokploy's own log viewer per service)
docker logs -f rysthshop-api
docker logs -f rysthshop-worker

# Interactive REPL against the database, schema and services preloaded —
# the replacement for `rails console`. Top-level await works at the prompt.
docker exec -it rysthshop-api npm run console
```

---

## Notes

- **Database:** each deployment uses its own database — never share one
  between clients.
- **Admin bootstrap:** `npm run create-admin`, not a seed file. `db:seed`
  (run automatically on every deploy) only creates roles and permissions,
  never a user.
- **No data migration needed for a new shop.** `api/scripts/migrate-from-rails.ts`
  exists only for a server that already held data from the old Rails
  backend — skip it entirely for a fresh deployment like this one.
- **No license gate.** This build has none — a deployment is never
  time-limited or blocked by a license check.
- **Ports:** `admin` and `api` publish nothing to the host in production —
  Traefik reaches both over the docker network directly via their labels.
  Only `docker-compose.dev.yml` (local development) publishes host ports.
- **SSL:** Traefik issues and renews Let's Encrypt certificates
  automatically once DNS resolves.
- **Jobs:** the `worker` container is required in production —
  transactional email and the storefront's order-notification queue both
  run through it.

---

**Created by:** [RysthDesign](https://rysthdesign.com/)
