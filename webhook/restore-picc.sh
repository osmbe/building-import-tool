#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore-picc.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-picc.sh <run_id> <repo>}"

WORK_DIR="/tmp/picc-restore"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "[restore-picc] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n picc-dump -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/picc.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
    echo "[restore-picc] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
fi

echo "[restore-picc] Restoring to be2osm database (picc schema)..."

PSQL="psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm"
export PGPASSWORD="${POSTGRES_PASSWORD}"

# Drop existing tables (full dump recreates them)
${PSQL} -c "DROP MATERIALIZED VIEW IF EXISTS picc.buildings_with_addresses CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS picc.constr_batiemprise CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS picc.icar_adr_pt CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS picc.import_meta CASCADE;" || true

# Restore full dump (includes CREATE TABLE statements)
gunzip -c "${DUMP_FILE}" | ${PSQL}

# Update statistics
${PSQL} -c "ANALYZE picc.constr_batiemprise;" || true
${PSQL} -c "ANALYZE picc.icar_adr_pt;" || true

echo "[restore-picc] Done."
