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
#   COMPOSE_FILE_PATH=... APP_SERVICE=app APP_CONTAINER=... DB_CONTAINER=... ./deploy/update.sh
#
# Si la actualización trae migraciones de base de datos, las aplica solo:
# primero respalda la base (backups/), luego migra, y hasta entonces cambia
# la app a la versión nueva. Si la migración falla, la app anterior sigue
# corriendo y se indica cómo restaurar el respaldo.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f docker/docker-compose.preview.yml ]; then
  default_compose="docker/docker-compose.preview.yml"; default_container="reymen-ai-ops-preview"; default_db="reymen-ai-ops-preview-postgres"
else
  default_compose="docker/docker-compose.prod.yml"; default_container="reymen_app"; default_db="reymen_postgres"
fi
compose_file="${COMPOSE_FILE_PATH:-$default_compose}"
service="${APP_SERVICE:-app}"
container="${APP_CONTAINER:-$default_container}"
db_container="${DB_CONTAINER:-$default_db}"
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

# Se detectan ANTES del pull, comparando contra lo que trae origin/main.
g fetch origin main
new_migrations="$(g diff --name-only --diff-filter=A HEAD origin/main -- prisma/migrations | grep 'migration.sql$' || true)"

g pull --ff-only origin main
# Solo la app: Postgres, n8n y el proxy siguen corriendo sin reiniciarse.
compose build "$service"

# La imagen de producción no trae la herramienta de migraciones de Prisma,
# así que se aplican con la etapa "builder" del mismo Dockerfile (ya en caché
# por el build de arriba), conectada a la misma red y base que usa la app.
# Se hace ANTES de levantar la app nueva: código nuevo sobre un esquema viejo
# truena, y mientras tanto la app anterior sigue atendiendo.
if [ -n "$new_migrations" ]; then
  echo "→ Migraciones nuevas:"
  echo "$new_migrations" | sed 's/^/    /'

  db_url="$(sudo docker exec "$container" printenv DATABASE_URL 2>/dev/null || true)"
  db_network="$(sudo docker inspect "$db_container" --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null | awk '{print $1}')"
  if [ -z "$db_url" ] || [ -z "$db_network" ]; then
    echo "✗ No se pudo leer DATABASE_URL de $container o la red de $db_container." >&2
    echo "  Revisa que ambos contenedores estén corriendo (o indica APP_CONTAINER / DB_CONTAINER)." >&2
    exit 1
  fi

  mkdir -p backups
  backup="backups/antes-de-migrar-$(date +%Y%m%d-%H%M%S).dump"
  echo "→ Respaldando la base en $backup ..."
  if ! sudo docker exec "$db_container" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup" || [ ! -s "$backup" ]; then
    echo "✗ No se pudo respaldar la base; no se aplicó ninguna migración y la app no cambió." >&2
    exit 1
  fi

  echo "→ Aplicando migraciones ..."
  sudo docker build --target builder -t reymen-ai-ops-migrator -f docker/Dockerfile . >/dev/null
  if ! sudo docker run --rm --network "$db_network" -e DATABASE_URL="$db_url" reymen-ai-ops-migrator npx prisma migrate deploy; then
    echo "✗ La migración falló. La app anterior sigue corriendo sin cambios." >&2
    echo "  Respaldo previo: $(pwd)/$backup" >&2
    echo "  Para restaurarlo:" >&2
    echo "    sudo docker exec -i $db_container sh -c 'pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --clean --if-exists' < $(pwd)/$backup" >&2
    exit 1
  fi
  echo "✓ Migraciones aplicadas (respaldo en $backup)."
fi

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
