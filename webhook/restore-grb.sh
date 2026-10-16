#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore-grb.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-grb.sh <run_id> <repo>}"

WORK_DIR="/tmp/grb-restore"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "[restore-grb] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n be2osm-dump -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/be2osm.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
    echo "[restore-grb] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
fi

echo "[restore-grb] Restoring to be2osm database..."

export PGHOST="${POSTGRES_HOST}" PGPORT="${POSTGRES_PORT}" PGUSER="${POSTGRES_USER}" PGPASSWORD="${POSTGRES_PASSWORD}"
export PGDATABASE=be2osm
PSQL="psql -X -v ON_ERROR_STOP=1"

# Empty every GRB table the dump fills (import_meta included: it holds the dump's import time). The migration
# tracking table is not in the dump and stays.
${PSQL} -q <<'SQL'
DO $$
BEGIN
    EXECUTE (
        SELECT 'TRUNCATE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE'
        FROM pg_tables WHERE schemaname = 'grb' AND tablename <> 'schema_migrations'
    );
END $$;
SQL

# Bring the schema up to date: the data-only dump COPYs the columns of the current schema (e.g.
# building_polygons.entity). On the emptied tables even heavy migrations are instant.
bash "${COMPOSE_PROJECT_DIR}/processing/sql/migrate.sh"

gunzip -c "${DUMP_FILE}" | ${PSQL} -q

${PSQL} -c "ANALYZE grb.building_polygons, grb.buildings, grb.addresses, grb.address_building_links, grb.polygon_building_rel, grb.kunstwerken;"

# The data-only dump carries no materialized view data: rebuild it from the restored tables (tiles + addresses).
# CONCURRENTLY keeps the previous contents readable while it runs (20-30 min for the full dataset).
echo "[restore-grb] Refreshing grb.buildings_with_addresses..."
${PSQL} -c "REFRESH MATERIALIZED VIEW CONCURRENTLY grb.buildings_with_addresses;"

echo "[restore-grb] Done."
