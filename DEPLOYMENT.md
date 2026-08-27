# Deployment Guide — Multi-Company Setup

This guide explains how to deploy the same codebase for a new client (e.g. an existing setup for `currentcompany.com` and a new deployment for `newcompany.com`).

Each deployment is **self-hosted and single-tenant**: one client, one database, one business row.

## Deployment Process

### Step 1: Update the Docker network name

**File:** `docker-compose.yml`

Change the network name to avoid conflicts with other projects on the same host:

```yaml
networks:
  newcompany_network: # Change from currentcompany_network
    driver: bridge
```

And update the network reference on every service (`admin`, `api`, `worker`).

`setup.sh` does this rename for you, along with the container names.

### Step 2: Update domain names in Docker Compose

**File:** `docker-compose.yml`

Update the Traefik labels with the new domains:

```yaml
services:
  admin:
    labels:
      - "traefik.http.routers.admin.rule=Host(`admin.newcompany.com`)"
  api:
    labels:
      - "traefik.http.routers.api.rule=Host(`api.newcompany.com`)"
```

### Step 3: Update the runtime proxy variables

**Files:** `docker-compose.yml`, `.env`

The admin image renders its Nginx config from environment variables at container startup, so set these rather than editing `admin/nginx.conf`:

```env
ADMIN_SERVER_NAME=admin.newcompany.com
API_UPSTREAM_SCHEME=https
API_UPSTREAM_HOST=api.newcompany.com
API_UPSTREAM_PORT=443
```

Nginx proxies `/api/*` and `/up` to the API and serves the SPA for everything else.

### Step 4: Create the `.env` for the new client

```env
NODE_ENV=production

# Admin
ADMIN_FRONTEND_URL=https://admin.newcompany.com
ADMIN_ALLOWED_ORIGINS=https://admin.newcompany.com
VITE_API_URL=https://api.newcompany.com

# Database (a separate database per deployment)
DB_HOST=postgres
DB_NAME=newcompany_db
DB_USER=newcompany_user
DB_PASSWORD=your_secure_password

# Signs session cookies and verification/reset tokens.
# REQUIRED, minimum 32 characters — the API refuses to boot below that.
# Generate a unique one per deployment and never reuse it between clients:
#   openssl rand -hex 64
SECRET_KEY_BASE=

# SMTP, Cloudflare R2, etc.
```

The API validates its whole environment with Zod at boot (`api/src/config/env.ts`), so a misconfigured deployment fails immediately and says which variable is wrong, rather than breaking at the first request that needs it.

### Step 5: Deploy

```bash
docker compose build
docker compose up -d
```

The `api` container applies migrations and seeds roles and permissions before it starts listening; the healthcheck (`GET /up`) only passes once that has finished. Nothing is installed at container start — dependencies are baked into the image.

### Step 6: Create the first administrator

A fresh database has roles and permissions but no users, and every route except `GET /api/v1/public/business` requires a session:

```bash
docker compose exec -e ADMIN_EMAIL=admin@newcompany.com api npm run create-admin
```

With no `ADMIN_PASSWORD` set, a strong password is generated and printed **once** — save it before closing the terminal. The command is idempotent: run against an existing email, it only grants the admin role and leaves the password alone.

Login is a single step for every role, so a working SMTP server is not required to sign in — only for password-reset and email-verification mail.

## Database Migrations

### Automatic execution

Migrations run automatically on container start, from this line in `docker-compose.yml`:

```yaml
command: sh -c "npm run db:deploy && npm run db:seed && exec node src/server.ts"
```

`db:deploy` uses drizzle-orm's runtime migrator rather than the `drizzle-kit` CLI. The CLI does currently land in the production image — `better-auth` declares it as an optional peer dependency, so npm installs it even under `--omit=dev` — but that is incidental and could disappear with a lockfile refresh or a `better-auth` upgrade. The runtime migrator only needs the SQL files and the journal, both of which are copied into the image, so it does not depend on that accident.

### Migration process

1. **Edit the schema:** `api/src/db/schema.ts`
2. **Generate SQL:** `docker compose -f docker-compose.dev.yml exec api npm run db:generate`
3. **Commit** both the schema change and the generated files under `api/drizzle/`
4. **Deploy:** `docker compose up -d api` — the new migration is applied on start

### Manual migration (if needed)

```bash
docker compose exec api npm run db:deploy
```

Drizzle has no rollback command. To undo a migration, write a new one that reverses it.

## Migrating a client off the Rails backend

For a server that already holds Rodauth data, copy it into the new schema before pointing the SPA at the new API:

```bash
docker compose exec \
  -e RAILS_DATABASE_URL=postgres://user:pass@host:5432/rails_api_development \
  api npm run migrate:from-rails -- --dry-run
```

Drop `--dry-run` to apply it. The script is additive, idempotent, and never writes to the Rails database, so a failed run can be retried and the rollback is simply "keep using Rails". Passwords carry over — bcryptjs reads Rodauth's `$2a$12$` hashes, so nobody has to reset theirs.

The business row and role assignments come across too. Verify the summary reports `OK` for users, verified and assignments before switching traffic.

## Quick Checklist for a New Deployment

- [ ] Change the network name in `docker-compose.yml`
- [ ] Update the admin and API domains in the Traefik labels
- [ ] Set `ADMIN_SERVER_NAME`, `API_UPSTREAM_SCHEME`, `API_UPSTREAM_HOST`, `API_UPSTREAM_PORT`
- [ ] Update allowed hosts in `admin/vite.config.ts`
- [ ] Create the `.env` with client-specific variables
- [ ] Generate a unique `SECRET_KEY_BASE` (`openssl rand -hex 64`)
- [ ] Confirm SMTP works — needed for password-reset and verification mail (not for login)
- [ ] Build and deploy: `docker compose up -d`
- [ ] Create the first administrator and save the generated password
- [ ] Test login and functionality

## Troubleshooting

### Common issues

1. **API container restarts immediately:** read the logs — the Zod env validation prints the offending variable. A `SECRET_KEY_BASE` under 32 characters is the usual cause.
2. **502 Bad Gateway:** the Nginx upstream domain doesn't match the Traefik labels.
3. **SSL errors:** make sure the Nginx upstream uses port 443.
4. **Password-reset / verification mail never arrives:** SMTP is misconfigured. Check the `worker` logs — mail is queued, so failures show there, not in the API.
5. **Network issues:** verify every service uses the same network name.

### Debug commands

```bash
# Running containers
docker ps

# Logs
docker compose logs -f api
docker compose logs -f worker

# Health check
curl https://api.newcompany.com/up

# Network connectivity
docker network inspect newcompany_network

# One-off query against the database
docker compose exec postgres psql -U "$DB_USER" -d "$DB_NAME"
```

## Notes

- **Database:** each deployment uses a separate database.
- **Admin bootstrap:** `npm run create-admin`, not a seed file — seeds only create roles and permissions.
- **Environment:** use a different `.env` per deployment, and never reuse `SECRET_KEY_BASE` between clients.
- **Domains:** ensure DNS points to your Dokploy server.
- **SSL:** Traefik handles Let's Encrypt certificates automatically for new domains.
- **Jobs:** the `worker` container is required in production — transactional email runs through it.

---

**Created by:** [RysthDesign](https://rysthdesign.com/)
