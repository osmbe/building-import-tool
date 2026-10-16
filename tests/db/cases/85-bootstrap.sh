# Helpers of scripts/server-bootstrap.sh (the rest of it only runs against the production stack).
out=$(webhook_run webhook bash -c '
set -euo pipefail
BOOTSTRAP_LIB=1 source /scripts/server-bootstrap.sh
printf "%s\n" "CREATE USER MAPPING FOR be2osm SERVER osmbe_server OPTIONS (\"user\" '\''be2osm'\'', password '\''hunter2'\'');" | redact_schema
cat > /tmp/env <<ENV
POSTGRES_USER=be2osm
NUXT_IMAGE=ghcr.io/x/nuxt-app:latest
  PROCESSING_IMAGE=ghcr.io/x/processing:latest
COMPOSE_PROJECT_NAME=old
ENV
normalise_env /tmp/env buildings /opt/docker/buildings
normalise_env /tmp/env buildings /opt/docker/buildings
echo "---"
grep -v "^#" /tmp/env | grep -v "^$"
' 2>&1) || true
assert_eq "$(head -1 <<<"$out")" \
    "CREATE USER MAPPING FOR be2osm SERVER osmbe_server OPTIONS (\"user\" 'be2osm', password 'REDACTED');" \
    "the schema snapshot has its passwords redacted"
assert_eq "$(sed -n '/^---$/,$p' <<<"$out" | tail -n +2 | tr '\n' ' ')" \
    "POSTGRES_USER=be2osm COMPOSE_PROJECT_NAME=buildings COMPOSE_PROJECT_DIR=/opt/docker/buildings " \
    ".env loses its image overrides and pins the compose project (idempotent)"
