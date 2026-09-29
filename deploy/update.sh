#!/usr/bin/env bash
# Actualiza Reymen AI OPS (app.reymen.mx) en producción desde main y verifica
# que quede sano. Mismo flujo que deploy/update.sh del repo ReymenPOS.
# Uso (en el VPS, dentro de la carpeta de este repo):  ./deploy/update.sh
#
# Si en el VPS la app corre con otro compose o con otro nombre de servicio o
# contenedor, se pueden cambiar sin editar el script:
#   COMPOSE_FILE_PATH=docker-compose.yml APP_SERVICE=app APP_CONTAINER=reymen_app ./deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."

compose_file="${COMPOSE_FILE_PATH:-docker/docker-compose.prod.yml}"
service="${APP_SERVICE:-app}"
container="${APP_CONTAINER:-reymen_app}"
compose() { sudo docker compose -f "$compose_file" "$@"; }

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "✗ Producción solo se despliega desde main (rama actual: $branch)." >&2
  echo "  git checkout main   y vuelve a correr este script." >&2
  exit 1
fi

if [ ! -f "$compose_file" ]; then
  echo "✗ No existe $compose_file. Indica el compose correcto con COMPOSE_FILE_PATH=..." >&2
  exit 1
fi

# La imagen de producción no aplica migraciones de Prisma al arrancar: si la
# actualización trae migraciones nuevas, se detiene ANTES de tocar nada para
# que se apliquen primero (código nuevo sobre un esquema viejo truena).
git fetch origin main
new_migrations="$(git diff --name-only --diff-filter=A HEAD origin/main -- prisma/migrations | grep 'migration.sql$' || true)"
if [ -n "$new_migrations" ] && [ "${MIGRATIONS_APPLIED:-0}" != "1" ]; then
  echo "✗ Esta actualización trae migraciones de base de datos nuevas:" >&2
  echo "$new_migrations" | sed 's/^/    /' >&2
  echo "  Aplícalas en la base de producción (npx prisma migrate deploy) y luego corre:" >&2
  echo "    MIGRATIONS_APPLIED=1 ./deploy/update.sh" >&2
  exit 1
fi

git pull --ff-only origin main
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
  echo "✓ Actualización correcta ($(git log -1 --format='%h %s'))."
else
  echo "✗ La app no quedó sana. Respuesta de /api/health: ${health:-(sin respuesta)}" >&2
  echo "  Revisa:  sudo docker compose -f $compose_file logs --tail=100 $service" >&2
  exit 1
fi
