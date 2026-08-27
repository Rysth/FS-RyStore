#!/usr/bin/env bash
set -euo pipefail

blue()  { echo -e "\033[0;34m[INFO]\033[0m $*"; }
green() { echo -e "\033[0;32m[SUCCESS]\033[0m $*"; }
yellow(){ echo -e "\033[1;33m[WARNING]\033[0m $*"; }
red()   { echo -e "\033[0;31m[ERROR]\033[0m $*"; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Files used to track the applied project name across runs
PROJECT_NAME_FILE=".project"
PROJECT_NAME_APPLIED_FILE=".project.applied"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "No se encontró el comando '$1'. Instálalo y vuelve a intentar."
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# ask_project_name
#   Prompts the user for a project name.  If one was already stored in
#   .project the previous value is offered as the default (press Enter to
#   keep it).  The chosen name is written to $PROJECT_NAME_FILE and exported
#   as the global $PROJECT_NAME variable.
# ---------------------------------------------------------------------------
ask_project_name() {
  local stored_name=""

  if [[ -f "$PROJECT_NAME_FILE" ]]; then
    stored_name=$(cat "$PROJECT_NAME_FILE")
  fi

  echo ""
  echo -e "\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
  echo -e "\033[1;36m  Configuración del nombre del proyecto\033[0m"
  echo -e "\033[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
  echo "  Este nombre se usará para los contenedores y redes de Docker."
  echo "  Usa solo letras, números, guiones o guiones bajos (p.ej. myapp)."
  echo ""

  if [[ -n "$stored_name" ]]; then
    echo -n "  Nombre del proyecto [${stored_name}]: "
  else
    echo -n "  Nombre del proyecto: "
  fi

  read -r input_name

  if [[ -z "$input_name" && -n "$stored_name" ]]; then
    PROJECT_NAME="$stored_name"
  elif [[ -n "$input_name" ]]; then
    PROJECT_NAME="$input_name"
  else
    red "Debes introducir un nombre para el proyecto."
    exit 1
  fi

  # Must start with a letter; only letters, digits, hyphens, underscores allowed
  if [[ ! "$PROJECT_NAME" =~ ^[a-zA-Z][a-zA-Z0-9_-]+$ ]]; then
    red "Nombre inválido: '${PROJECT_NAME}'."
    red "Debe empezar con una letra y contener solo letras, números, '-' o '_'."
    exit 1
  fi

  echo "$PROJECT_NAME" > "$PROJECT_NAME_FILE"
  echo ""
  green "Nombre del proyecto: '${PROJECT_NAME}'"
}

# ---------------------------------------------------------------------------
# update_service_names  <new_name>
#   Patches container_name and network references inside both compose files
#   using the previously-applied name (stored in .project.applied) as the
#   search pattern.  On the very first run the hard-coded defaults are used.
# ---------------------------------------------------------------------------
update_service_names() {
  local new_name="$1"
  local prev_name=""

  if [[ -f "$PROJECT_NAME_APPLIED_FILE" ]]; then
    prev_name=$(cat "$PROJECT_NAME_APPLIED_FILE")
  fi

  blue "Actualizando nombres de servicios en los ficheros compose → '${new_name}'..."

  if [[ -z "$prev_name" ]]; then
    # ── First run: replace the original hard-coded defaults ──────────────
    sed -i \
      -e "s/container_name: base-admin/container_name: ${new_name}-admin/g" \
      -e "s/container_name: base-api/container_name: ${new_name}-api/g" \
      -e "s/container_name: base-postgres/container_name: ${new_name}-postgres/g" \
      -e "s/container_name: base-worker/container_name: ${new_name}-worker/g" \
      -e "s/base_network/${new_name}_network/g" \
      docker-compose.dev.yml

    sed -i \
      -e "s/container_name: base-admin/container_name: ${new_name}-admin/g" \
      -e "s/container_name: base-api/container_name: ${new_name}-api/g" \
      -e "s/container_name: base-worker/container_name: ${new_name}-worker/g" \
      -e "s/base_network/${new_name}_network/g" \
      docker-compose.yml
  else
    # ── Subsequent run: replace the previously-applied name ──────────────
    sed -i \
      -e "s/container_name: ${prev_name}-admin/container_name: ${new_name}-admin/g" \
      -e "s/container_name: base-admin/container_name: ${new_name}-admin/g" \
      -e "s/container_name: ${prev_name}-api/container_name: ${new_name}-api/g" \
      -e "s/container_name: base-api/container_name: ${new_name}-api/g" \
      -e "s/container_name: ${prev_name}-postgres/container_name: ${new_name}-postgres/g" \
      -e "s/container_name: base-postgres/container_name: ${new_name}-postgres/g" \
      -e "s/container_name: ${prev_name}-worker/container_name: ${new_name}-worker/g" \
      -e "s/container_name: base-worker/container_name: ${new_name}-worker/g" \
      -e "s/${prev_name}_network/${new_name}_network/g" \
      -e "s/base_network/${new_name}_network/g" \
      docker-compose.dev.yml

    sed -i \
      -e "s/container_name: ${prev_name}-admin/container_name: ${new_name}-admin/g" \
      -e "s/container_name: ${prev_name}-api/container_name: ${new_name}-api/g" \
      -e "s/container_name: ${prev_name}-worker/container_name: ${new_name}-worker/g" \
      -e "s/${prev_name}_network/${new_name}_network/g" \
      docker-compose.yml
  fi

  echo "$new_name" > "$PROJECT_NAME_APPLIED_FILE"
  green "Ficheros compose actualizados correctamente."
}

# ---------------------------------------------------------------------------
# cleanup_conflicting_containers  <project_name>
#   Explicitly removes containers that use hard-coded names.  docker compose
#   down only removes containers belonging to the current project, so
#   containers from previous runs (or a different project) that own the
#   same container_name will block creation of new ones.
# ---------------------------------------------------------------------------
cleanup_conflicting_containers() {
  local new_name="$1"

  blue "Limpiando contenedores residuales para evitar conflictos de nombres..."

  # Original hard-coded names from the compose files
  docker rm -f base-admin base-api base-postgres base-worker 2>/dev/null || true

  # Names from a previously-applied project
  if [[ -f "$PROJECT_NAME_APPLIED_FILE" ]]; then
    local prev_name
    prev_name=$(cat "$PROJECT_NAME_APPLIED_FILE")
    if [[ "$prev_name" != "$new_name" ]]; then
      docker rm -f "${prev_name}-admin" "${prev_name}-api" "${prev_name}-postgres" "${prev_name}-worker" 2>/dev/null || true
    fi
  fi

  green "Limpieza completada."
}

# ---------------------------------------------------------------------------
# ensure_dev_smtp_defaults
#   In development the compose file routes all mail to mailpit regardless of
#   what .env says, so a real SMTP server is never needed locally.  This only
#   reports which of the two is in play; it never overrides a value.
# ---------------------------------------------------------------------------
ensure_dev_smtp_defaults() {
  local smtp_host
  smtp_host=$(grep -m1 '^SMTP_HOST=' .env 2>/dev/null | cut -d '=' -f2- || true)

  if [[ "$smtp_host" == "smtp.example.com" || -z "$smtp_host" ]]; then
    blue "SMTP_HOST tiene el valor de ejemplo, pero en desarrollo no hace falta:"
    blue "el compose enruta todo el correo a mailpit (http://localhost:8025)."
  else
    blue "SMTP personalizado detectado (SMTP_HOST=${smtp_host}). No se modifica .env."
    blue "Aun así, en desarrollo el correo va a mailpit (http://localhost:8025)."
  fi
}

# ---------------------------------------------------------------------------
# ensure_first_admin
#   The api container seeds roles and permissions on every start, but a fresh
#   database has no users, and every route except the public business endpoint
#   needs a session.  This offers to create the first administrator.
# ---------------------------------------------------------------------------
ensure_first_admin() {
  local user_count
  user_count=$(docker compose -f docker-compose.dev.yml exec -T postgres \
    psql -U "${DB_USER:-postgres}" -d "${DB_NAME:-template_development}" -tAc "SELECT count(*) FROM users" 2>/dev/null | tr -d '[:space:]' || echo "")

  if [[ -z "$user_count" ]]; then
    yellow "No se pudo consultar la tabla de usuarios. Crea el administrador manualmente con:"
    yellow "  docker compose -f docker-compose.dev.yml exec api npm run create-admin"
    return 0
  fi

  if [[ "$user_count" != "0" ]]; then
    blue "La base de datos ya tiene ${user_count} usuario(s). No se crea ninguno."
    return 0
  fi

  echo ""
  yellow "La base de datos no tiene usuarios: nadie podría iniciar sesión."
  echo -n "  ¿Crear el primer administrador ahora? [S/n]: "
  local create_admin
  read -r create_admin

  if [[ "$create_admin" =~ ^[nN]$ ]]; then
    blue "Omitido. Puedes crearlo más tarde con:"
    blue "  docker compose -f docker-compose.dev.yml exec api npm run create-admin"
    return 0
  fi

  if docker compose -f docker-compose.dev.yml exec api npm run create-admin; then
    green "Administrador creado. Anota la contraseña que se muestra arriba."
  else
    yellow "No se pudo crear el administrador. Puedes reintentarlo con:"
    yellow "  docker compose -f docker-compose.dev.yml exec api npm run create-admin"
  fi
}

start_containers() {
  # Crear .env si no existe
  if [[ ! -f ".env" ]]; then
    if [[ -f ".env.example" ]]; then
      blue "Creando .env desde .env.example..."
      cp .env.example .env
      green ".env creado."
    else
      red "No existe .env ni .env.example. Crea tu .env y vuelve a ejecutar."
      exit 1
    fi
  else
    blue ".env ya existe."
  fi

  # Informar sobre SMTP en desarrollo
  ensure_dev_smtp_defaults

  # Verificar que las carpetas necesarias existen
  if [[ ! -d "admin" ]]; then
    red "La carpeta 'admin' no existe. Asegúrate de que el repositorio esté completo."
    exit 1
  fi

  if [[ ! -f "api/Dockerfile" ]]; then
    red "La carpeta 'api' no existe o le falta Dockerfile. Asegúrate de que el repositorio esté completo."
    exit 1
  fi

  blue "API lista (api/Dockerfile)."

  # Exportar variables del .env (líneas KEY=VALUE sin comentarios)
  set -a
  # shellcheck disable=SC2046
  source <(grep -v '^\s*#' .env | sed 's/\r$//') || true
  set +a

  # Parar contenedores previos de este compose (no falla si no existen)
  blue "Deteniendo contenedores previos..."
  docker compose -f docker-compose.dev.yml down --remove-orphans || true

  # Limpiar contenedores con nombres hard-coded que docker compose down no toca
  cleanup_conflicting_containers "$PROJECT_NAME"

  blue "Levantando contenedores de docker-compose.dev.yml para desarrollo local..."
  blue "Servicios: api (Fastify), worker (pg-boss), admin (React), postgres, mailpit"
  # --wait blocks until the healthchecks pass, which covers the migrations and
  # the RBAC seed the api container runs before it starts listening.
  docker compose -f docker-compose.dev.yml up --build --force-recreate -d --wait

  green "API:         http://localhost:${PORT}"
  green "Admin panel: http://localhost:5173"
  green "Correos:     http://localhost:8025 (mailpit)"

  # Roles y permisos ya están sembrados: el contenedor api ejecuta db:deploy y
  # db:seed al arrancar. Lo que no puede crearse solo es el primer administrador.
  ensure_first_admin

  # ---------------------------------------------------------------------------
  # react-doctor: diagnose the React admin codebase
  # Uses bun (already available in the admin container via Dockerfile.dev)
  # ---------------------------------------------------------------------------
  if docker compose -f docker-compose.dev.yml exec -w /app admin sh -lc 'command -v git >/dev/null 2>&1'; then
    blue "Ejecutando react-doctor en el servicio 'admin' (vía bun)..."
    if docker compose -f docker-compose.dev.yml exec -w /app admin bunx react-doctor@latest . --no-ami; then
      green "react-doctor completado exitosamente."
    else
      yellow "react-doctor reportó advertencias o no pudo completar el análisis."
      yellow "Puedes ejecutarlo manualmente con:"
      yellow "  docker compose -f docker-compose.dev.yml exec -w /app admin bunx react-doctor@latest . --no-ami"
    fi
  else
    yellow "Saltando react-doctor: el contenedor admin no tiene 'git' instalado."
    yellow "Eso no bloquea la app; puedes instalar git en la imagen o correr react-doctor manualmente más tarde."
  fi

  # Mostrar logs en primer plano
  blue "Mostrando logs de los contenedores (Ctrl+C para salir)..."
  docker compose -f docker-compose.dev.yml logs -f
}

main() {
  cd "$ROOT_DIR"

  blue "Verificando dependencias..."
  require_cmd git
  require_cmd docker
  # Verificar plugin docker compose
  if ! docker compose version >/dev/null 2>&1; then
    red "Se requiere 'docker compose' (plugin). Instálalo y vuelve a intentar."
    exit 1
  fi

  # Prompt for project name and patch compose files
  ask_project_name
  update_service_names "$PROJECT_NAME"

  start_containers
}

main "$@"
