#!/usr/bin/env bash
# Actualiza Reymen AI OPS (app.reymen.mx) en producción desde main y verifica
# que quede sana. Mismo flujo que deploy/update.sh del repo ReymenPOS.
# Uso (en el VPS; la carpeta es de emilianorm, así que se corre con sudo):
#   sudo /home/emilianorm/reymen-ai-ops-preview/deploy/update.sh
#
# En el VPS, app.reymen.mx corre con docker/docker-compose.preview.yml
# (archivo local del servidor, no versionado) en el contenedor
# reymen-ai-ops-preview; si ese compose no existe se usa el de producción
# del repo. Se pueden forzar otros valores sin editar el script:
#   COMPOSE_FILE_PATH=... APP_SERVICE=app APP_CONTAINER=... ./deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f docker/docker-compose.preview.yml ]; then
  default_compose="docker/docker-compose.preview.yml"; default_container="reymen-ai-ops-preview"
else
  default_compose="docker/docker-compose.prod.yml"; default_container="reymen_app"
fi
compose_file="${COMPOSE_FILE_PATH:-$default_compose}"
service="${APP_SERVICE:-app}"
container="${APP_CONTAINER:-$default_container}"
compose() { sudo docker compose -f "$compose_file" "$@"; }

# La carpeta del repo puede ser de otro usuario del VPS: git se corre como su
# dueño (sus llaves de GitHub y sin el error de "dubious ownership").
repo_owner="$(stat -c %U .)"
if [ "$repo_owner" = "$(id -un)" ]; then
  g() { git "$@"; }
else
  g() { sudo -u "$repo_owner" -H git "$@"; }
fi

branch="$(g rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "✗ Producción solo se despliega desde main (rama actual: $branch)." >&2
  echo "  sudo -u $repo_owner git checkout main   y vuelve a correr este script." >&2
  exit 1
fi

if [ ! -f "$compose_file" ]; then
  echo "✗ No existe $compose_file. Indica el compose correcto con COMPOSE_FILE_PATH=..." >&2
  exit 1
fi

# La imagen de producción no aplica migraciones de Prisma al arrancar: si la
# actualización trae migraciones nuevas, se detiene ANTES de tocar nada para
# que se apliquen primero (código nuevo sobre un esquema viejo truena).
g fetch origin main
new_migrations="$(g diff --name-only --diff-filter=A HEAD origin/main -- prisma/migrations | grep 'migration.sql$' || true)"
if [ -n "$new_migrations" ] && [ "${MIGRATIONS_APPLIED:-0}" != "1" ]; then
  echo "✗ Esta actualización trae migraciones de base de datos nuevas:" >&2
  echo "$new_migrations" | sed 's/^/    /' >&2
  echo "  Aplícalas en la base de producción (npx prisma migrate deploy) y luego corre:" >&2
  echo "    MIGRATIONS_APPLIED=1 ./deploy/update.sh" >&2
  exit 1
fi

g pull --ff-only origin main
# Solo la app: Postgres, n8n y el proxy siguen corriendo sin reiniciarse.
compose build "$service"
compose up -d "$service"
compose ps

# Espera a que /api/health responda "ok" (incluye conexión a la base), máx. ~2 min.
health=""
for _ in $(seq 1 24); do
  health="$(sudo docker exec "$container" wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null || true)"
  case "$health" in
    *'"status":"ok"'*) break ;;
  esac
  sleep 5
done

state="$(sudo docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null || echo "no encontrado")"
echo "$container: $state"
if [ "$state" = "running" ] && [[ "$health" == *'"status":"ok"'* ]]; then
  echo "✓ Actualización correcta ($(g log -1 --format='%h %s'))."
else
  echo "✗ La app no quedó sana. Respuesta de /api/health: ${health:-(sin respuesta)}" >&2
  echo "  Revisa:  sudo docker compose -f $compose_file logs --tail=100 $service" >&2
  exit 1
fi
