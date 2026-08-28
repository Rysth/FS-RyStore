# RyStore

**Catálogo de WhatsApp y checkout para tiendas pequeñas.** Son tres aplicaciones sobre
una sola base de datos: el comprador navega el **storefront**, la tienda se administra
desde el **panel admin**, y una **API** conecta a ambos. Se distribuye **self-hosted,
single-tenant por cliente** con Docker Compose: cada despliegue atiende a un negocio.

> El repositorio conserva rastros del nombre anterior por historia: empezó como una
> plantilla React + Rails; el backend Rails se migró a Fastify + Drizzle por fases
> (`git log --grep "migration phase"`) y luego se portó encima el dominio de RyStore
> (catálogo, pedidos, cupones, reportes, storefront) desde la app Rails original.

El contexto canónico y detallado del proyecto vive en [`AGENTS.md`](./AGENTS.md)
(stack, arquitectura, RBAC, flujo de auth, jobs, reglas de dinero y precios,
convenciones). Este README es solo la guía de arranque.

## Por qué el storefront se renderiza en el servidor

El canal de distribución de la tienda es pegar el enlace de un producto en WhatsApp, y
WhatsApp lee las etiquetas Open Graph del **HTML inicial**. Una página renderizada en el
cliente se previsualizaría como una tarjeta en blanco, así que el storefront (Astro SSR)
se renderiza en cada request. Se verifica así:

```bash
curl -A "WhatsApp/2.23" http://localhost:4321/producto/demo-camiseta | grep 'og:'
```

## Stack

| Capa | Tecnología | Puerto dev |
| --- | --- | --- |
| Admin | React 19, TypeScript 5.7, Vite 6, TailwindCSS 4, Shadcn/ui | 5173 |
| Storefront | Astro 5 SSR (adaptador node standalone) + islas React, Bun | 4321 |
| Backend | Fastify 5, better-auth, Drizzle ORM, Zod (Node 24, TypeScript) | 3000 |
| Worker | pg-boss (mismo código, contenedor `worker` aparte) | — (solo jobs) |
| Base de datos | PostgreSQL 16 | interno |
| Colas | pg-boss, en su propio esquema en el mismo Postgres — sin Redis | interno |
| Email dev | Mailpit (bandeja SMTP en el navegador) | 8025 |

No hay app móvil ni microservicio NestJS en este repo.

Node 24 ejecuta TypeScript directamente por *type stripping*, así que **no hay paso de
build ni compilador en la imagen de producción**. `tsc --noEmit` (`erasableSyntaxOnly`)
rechaza en el typecheck la sintaxis que Node no puede quitar: enums, decoradores y
parameter properties. Los imports llevan la extensión `.ts` por lo mismo.

## Inicio rápido

### Requisitos

- Docker y el plugin de Docker Compose
- Git

### Configuración automática

```bash
git clone https://github.com/Rysth/FS-RyStore.git
cd FS-RyStore
chmod +x setup.sh
./setup.sh
```

`setup.sh` hace lo siguiente:

- Pide un nombre de stack para los `container_name` y la red de Docker.
- Crea `.env` desde `.env.example` si no existe.
- Actualiza los nombres de contenedor en los archivos compose.
- Levanta `admin`, `storefront`, `api`, `worker`, `postgres` y `mailpit`, y espera a que
  pasen sus healthchecks (eso cubre las migraciones y el seed de RBAC).
- Ofrece crear el primer administrador si la tabla de usuarios está vacía.

URLs locales:

- Storefront (la tienda): http://localhost:4321
- Panel admin: http://localhost:5173
- API: http://localhost:3000
- Mailpit (correos de desarrollo): http://localhost:8025

## Primer administrador

Una base de datos nueva trae roles y permisos, pero ningún usuario. Todas las rutas
salvo `GET /api/v1/public/business` requieren sesión, así que hay que crear el primero:

```bash
docker compose -f docker-compose.dev.yml exec api npm run create-admin
```

Lee `ADMIN_EMAIL` y `ADMIN_PASSWORD` del entorno. Si no defines contraseña, genera una
fuerte y la muestra **una sola vez**. Es idempotente: si el correo ya existe, solo le
concede el rol `admin` sin tocar la contraseña.

El inicio de sesión es de **un solo paso para todos los roles** (no hay OTP ni 2FA). El
registro público (`/auth/signup`) está deshabilitado: es software interno de cada tienda.

## Migrar un despliegue desde Rails

Para servidores de cliente que ya tienen datos de Rodauth:

```bash
docker compose -f docker-compose.dev.yml exec \
  -e RAILS_DATABASE_URL=postgres://user:pass@postgres:5432/rails_api_development \
  api npm run migrate:from-rails -- --dry-run
```

El script es aditivo e idempotente y nunca escribe en la base de datos de Rails, así que
un intento fallido se puede repetir. Quita `--dry-run` para aplicarlo. Una instalación
nueva no lo necesita.

## Estructura

```text
FS-RyStore/
├── admin/                       # SPA admin en React (Vite + Bun)
├── api/                         # API Fastify + worker pg-boss (Node 24, TypeScript)
├── storefront/                  # Tienda Astro 5 SSR que ve el comprador (Bun)
├── docker-compose.dev.yml       # Desarrollo local (+ Postgres, Mailpit)
├── docker-compose.yml           # Producción
├── setup.sh                     # Bootstrap local
├── AGENTS.md                    # Contexto canónico del proyecto
├── DEPLOYMENT.md                # Guía de despliegue en producción
└── README.md
```

## Comandos útiles

Desarrollo:

```bash
./setup.sh
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml logs -f api
```

API:

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:generate   # nueva migración desde schema.ts
docker compose -f docker-compose.dev.yml exec api npm run db:deploy     # aplicar migraciones
docker compose -f docker-compose.dev.yml exec api npm run db:seed       # roles y permisos (idempotente)
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # usuarios y catálogo demo (dev/test, no prod)
docker compose -f docker-compose.dev.yml exec api npm run create-admin
docker compose -f docker-compose.dev.yml exec api npm run console       # REPL interactivo (equivalente a rails console)
docker compose -f docker-compose.dev.yml exec api npm run typecheck
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
```

Admin:

```bash
docker compose -f docker-compose.dev.yml exec -w /app admin bun install
docker compose -f docker-compose.dev.yml exec -w /app admin bun run lint
```

## Variables de entorno

Copia `.env.example` a `.env` si no usas `setup.sh` (`cp .env.example .env`). Ese archivo
tiene la lista completa con comentarios; las principales:

| Variable | Uso |
| --- | --- |
| `APP_NAME` | Marca mostrada en los correos y como `appName` de better-auth |
| `SECRET_KEY_BASE` | Firma cookies y tokens. Mínimo 32 caracteres: la API no arranca por debajo. Genera uno por despliegue con `openssl rand -hex 64` |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME` | PostgreSQL (configuran el servicio y la `DATABASE_URL` de `api` y `worker`) |
| `ADMIN_FRONTEND_URL`, `ADMIN_ALLOWED_ORIGINS` | URL pública del admin y orígenes CORS permitidos |
| `VITE_API_URL`, `VITE_STOREFRONT_URL` | URLs que el bundle del admin hornea en tiempo de build |
| `STOREFRONT_URL` | Origen CORS para `/api/v1/public/*` |
| `API_INTERNAL_URL` | Base del API durante el SSR del storefront. Debe apuntar al `container_name` (`${STACK_NAME}-api`), **nunca** al nombre de servicio `api` |
| `PUBLIC_API_URL` | Base del API que llama el navegador del comprador. Se hornea en el bundle en build (los Dockerfiles y compose lo pasan como `build.args`) |
| `STACK_NAME` | Prefijo de los `container_name` y routers de Traefik. Cámbialo por cliente para alojar varias tiendas en un mismo VPS |
| `SMTP_*` | SMTP en producción (en desarrollo el correo va a Mailpit) |
| `CLOUDFLARE_*` | Configuración de Cloudflare R2 para assets (logo, imágenes de producto, comprobantes) |

Dos trampas ya pagadas en producción, explicadas en `AGENTS.md §9`: nunca apuntes una
URL interna al *nombre de servicio* de compose (en una red compartida Docker reparte
entre stacks de distintos clientes), y `PUBLIC_API_URL` / `VITE_*` deben ser build args,
no solo env de runtime.

## Autenticación

better-auth con cookies/sesión (`rr.session_token`, HttpOnly, SameSite=Lax, 14 días),
**no** bearer JWT. Las rutas viven bajo `/api/v1/auth`:

- `POST /api/v1/auth/sign-in/email` — un solo paso para todos los roles
- `POST /api/v1/auth/sign-up/email`
- `POST /api/v1/auth/sign-out`
- `POST /api/v1/auth/request-password-reset`
- `POST /api/v1/auth/reset-password`
- `POST /api/v1/auth/verify-email`

Las contraseñas son bcrypt (`bcryptjs`, coste 12), compatibles con los hashes
`$2a$12$` que produjo el despliegue Rails/Rodauth: una migración no obliga a resetear
contraseñas.

## Roles y permisos

18 keys de permisos, definidas en `api/src/db/seed.ts` (`PERMISSION_KEYS`) y espejadas en
`admin/src/types/auth.ts` (`Permissions`) — ambas listas deben mantenerse sincronizadas.
Cubren panel, usuarios, negocio y tienda (catálogo, pedidos, cupones, contactos,
reportes).

| Rol | Permisos |
| --- | --- |
| admin | Los 18 |
| manager | Los 18 (hoy idéntico a admin) |
| operator | `view_dashboard`, `edit_profile`, `view_catalog`, `view_orders`, `manage_orders` |
| user | `edit_profile` |

El `operator` es el personal de mostrador: trabaja pedidos todo el día y consulta el
catálogo en solo lectura, pero no toca precios, cupones, contactos ni reportes.

## Docker

Desarrollo (`docker-compose.dev.yml`): `admin`, `storefront`, `api`, `worker`,
`postgres`, `mailpit`.

Producción (`docker-compose.yml`): `admin`, `storefront`, `api`, `worker`. PostgreSQL se
espera como servicio externo administrado por la infraestructura (Dokploy).

Ambos archivos arrancan la API con `db:deploy && db:seed` — el migrador en runtime más el
seed idempotente de RBAC. Las dependencias están horneadas en la imagen; nada se instala
al arrancar el contenedor.

## Desarrollo sin Docker

Docker es el flujo recomendado. Si necesitas correr partes localmente necesitarás Node 24
o superior, PostgreSQL y variables equivalentes a `.env` en tu entorno:

```bash
# Admin
cd admin && bun install && bun run dev

# API
cd api && npm install && npm run db:deploy && npm run db:seed && npm run dev

# Storefront
cd storefront && bun install && bun run dev
```

## Testing y lint

Backend: `node:test` (runner nativo de Node), sin Jest ni Vitest. La suite corre contra
la base de datos viva y espera las fixtures de `npm run db:seed:dev` (usuarios
`@example.com` con `password123` y un catálogo demo). El compose de desarrollo ejecuta
ese seed al arrancar.

```bash
docker compose -f docker-compose.dev.yml exec api npm run db:seed:dev   # si la tabla de usuarios se vació
docker compose -f docker-compose.dev.yml exec -e NODE_ENV=test api npm test
```

Frontend: ESLint vía `bun run lint` (sin Prettier). **No hay runner de tests frontend**
configurado en `admin/` ni en `storefront/`; el storefront se verifica conduciéndolo
(ver los chequeos end-to-end en `AGENTS.md §9`).

```bash
docker compose -f docker-compose.dev.yml exec -w /app admin bun run lint
```

## Notas

- Todo el código es en inglés; todo el texto visible para usuarios es en **español**.
- El esquema de licencias se eliminó por completo en la fase 3 de la migración; no lo
  reintroduzcas sin pedirlo.
- No uses `Authorization: Bearer` para auth normal; el sistema usa sesión/cookies.
- El dinero se maneja en centavos enteros (`api/src/lib/money.ts`); el servidor recalcula
  todos los precios en cada pedido. Ver `AGENTS.md §11`.
- `.env` nunca debe commitearse.

## Licencia del código

Este proyecto está bajo la Licencia MIT.

---

Creado por [RysthDesign](https://rysthdesign.com/)
