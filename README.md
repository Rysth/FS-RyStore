# REACT-RAILS Stack

Stack full-stack self-hosted con panel administrativo en React y backend API en Fastify. El proyecto está pensado para despliegues single-tenant por cliente usando Docker Compose.

> El nombre del repositorio conserva "RAILS" por historia: el backend Rails se migró a Fastify + Drizzle en ocho fases (`git log --grep "migration phase"`) y se eliminó en la fase 8.

## Stack

| Capa | Tecnología | Puerto dev |
| --- | --- | --- |
| Frontend | React 19, TypeScript, Vite, TailwindCSS, Shadcn/ui | 5173 |
| Backend | Fastify 5, better-auth, Drizzle ORM (Node 24) | 3000 |
| Worker | pg-boss | - |
| Base de datos | PostgreSQL 16 | interno |
| Colas | pg-boss, esquema propio en la misma base de datos | interno |
| Email dev | Mailpit | 8025 |

No hay storefront, app móvil ni microservicio NestJS en este repo.

Node 24 ejecuta TypeScript directamente, así que no hay paso de build ni compilador en la imagen de producción.

## Inicio Rápido

### Requisitos

- Docker y Docker Compose plugin
- Git

### Configuración Automática

```bash
git clone https://github.com/Rysth/REACT-RAILS-Stack.git
cd REACT-RAILS-Stack
chmod +x setup.sh
./setup.sh
```

`setup.sh` hace lo siguiente:

- Pide un nombre de proyecto para contenedores y red de Docker.
- Crea `.env` desde `.env.example` si no existe.
- Actualiza nombres de contenedores en los compose files.
- Levanta `admin`, `api`, `worker`, `postgres` y `mailpit`, y espera a que estén sanos.
- Aplica migraciones y siembra roles y permisos al arrancar el contenedor `api`.
- Ofrece crear el primer administrador si la tabla de usuarios está vacía.

URLs locales:

- Admin panel: http://localhost:5173
- API: http://localhost:3000
- Mailpit (correos): http://localhost:8025

## Primer Administrador

Una base de datos nueva trae roles y permisos, pero ningún usuario. Todas las rutas salvo `GET /api/v1/public/business` requieren sesión, así que hay que crear el primero:

```bash
docker compose -f docker-compose.dev.yml exec api npm run create-admin
```

Lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` del entorno. Si no defines contraseña, genera una fuerte y la muestra **una sola vez**. Es idempotente: si el correo ya existe, solo le concede el rol `admin` sin tocar la contraseña.

El inicio de sesión es de un solo paso para todos los roles (no hay OTP).

## Migrar un Despliegue desde Rails

Para servidores de cliente que ya tienen datos de Rodauth:

```bash
docker compose -f docker-compose.dev.yml exec \
  -e RAILS_DATABASE_URL=postgres://user:pass@postgres:5432/rails_api_development \
  api npm run migrate:from-rails -- --dry-run
```

El script es aditivo e idempotente y nunca escribe en la base de datos de Rails, así que un intento fallido se puede repetir. Quita `--dry-run` para aplicarlo. Una instalación nueva no lo necesita.

## Estructura

```text
REACT-RAILS-Stack/
├── admin/                       # React admin SPA
├── api/                         # Fastify API + worker pg-boss
├── docker-compose.dev.yml       # Desarrollo local
├── docker-compose.yml           # Producción
├── setup.sh                     # Bootstrap local
├── AGENTS.md                    # Contexto canónico del proyecto
├── DEPLOYMENT.md                # Guía de despliegue
└── README.md
```

## Comandos Útiles

Desarrollo:

```bash
./setup.sh
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml logs -f
docker compose -f docker-compose.dev.yml logs -f api
```

API:

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:generate   # nueva migración desde schema.ts
docker compose -f docker-compose.dev.yml exec api npm run db:deploy     # aplicar migraciones
docker compose -f docker-compose.dev.yml exec api npm run db:seed       # roles y permisos (idempotente)
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # usuarios de prueba (dev/test, no prod)
docker compose -f docker-compose.dev.yml exec api npm run create-admin
docker compose -f docker-compose.dev.yml exec api npm run typecheck
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
```

Admin:

```bash
docker compose -f docker-compose.dev.yml exec -w /app admin bun install
docker compose -f docker-compose.dev.yml exec -w /app admin bun run lint
```

## Variables de Entorno

Copia `.env.example` a `.env` si no usas `setup.sh`:

```bash
cp .env.example .env
```

Variables principales:

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto publicado de la API, por defecto `3000` |
| `VITE_API_URL` | URL de API usada por el admin |
| `ADMIN_FRONTEND_URL` | URL pública del admin |
| `ADMIN_ALLOWED_ORIGINS` | Orígenes CORS permitidos |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME` | PostgreSQL (configuran el servicio y la `DATABASE_URL`) |
| `SECRET_KEY_BASE` | Firma cookies y tokens. Mínimo 32 caracteres: la API no arranca por debajo |
| `SMTP_*` | SMTP en producción (en desarrollo el correo va a Mailpit) |
| `CLOUDFLARE_*` | Configuración R2 para assets |

Genera `SECRET_KEY_BASE` con `openssl rand -hex 64`, uno distinto por despliegue.

## Autenticación

La autenticación es better-auth con cookies/sesión, no bearer JWT. Las rutas de auth viven bajo:

```text
/api/v1/auth
```

Endpoints principales:

- `POST /api/v1/auth/sign-in/email`
- `POST /api/v1/auth/sign-up/email`
- `POST /api/v1/auth/sign-out`
- `POST /api/v1/auth/request-password-reset`
- `POST /api/v1/auth/reset-password`

El inicio de sesión es de un solo paso para todos los roles.

## Roles y Permisos

Roles por defecto:

| Rol | Permisos |
| --- | --- |
| admin | Todos |
| manager | Todos |
| operator | Dashboard y perfil |
| user | Perfil |

`admin` y `manager` son equivalentes hoy: mismos permisos y mismo inicio de sesión.

Las keys de permisos viven en:

- Backend: `api/src/db/seed.ts`
- Frontend: `admin/src/types/auth.ts`

Ambas listas deben mantenerse sincronizadas.

## Docker

Servicios de desarrollo:

| Servicio | Descripción | Puerto |
| --- | --- | --- |
| admin | React admin | 5173 |
| api | Fastify API | 3000 |
| worker | Jobs pg-boss | - |
| postgres | PostgreSQL | interno |
| mailpit | Bandeja SMTP de desarrollo | 8025 |

En producción, `docker-compose.yml` contiene `admin`, `api` y `worker`. PostgreSQL se espera como servicio externo administrado por la infraestructura.

## Desarrollo Sin Docker

Docker es el flujo recomendado. Si necesitas correr partes localmente:

Admin:

```bash
cd admin
bun install
bun run dev
```

API:

```bash
cd api
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

Necesitarás Node 24 o superior, PostgreSQL y variables equivalentes a `.env` disponibles en tu entorno local.

## Testing y Lint

Backend (la suite espera los usuarios de `npm run db:seed:dev`; el compose de
desarrollo los crea al arrancar):

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # si la tabla de usuarios se vació
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
```

Frontend:

```bash
docker compose -f docker-compose.dev.yml exec -w /app admin bun run lint
```

No hay runner de tests frontend configurado actualmente.

## Notas

- Todo texto visible para usuarios debe estar en español.
- El esquema de licencias se eliminó por completo en la fase 3 de la migración; no lo reintroduzcas sin pedirlo.
- No uses `Authorization: Bearer` para auth normal; el sistema usa sesión/cookies.
- `.env` nunca debe commitearse.

## Licencia del Código

Este proyecto está bajo la Licencia MIT.

---

Creado por [RysthDesign](https://rysthdesign.com/)
