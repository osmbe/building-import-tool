#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore-urbis.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-urbis.sh <run_id> <repo>}"

WORK_DIR="/tmp/urbis-restore"
trap 'rm -rf "${WORK_DIR}"' EXIT

echo "[restore-urbis] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n urbis-dump -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/urbis.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
    echo "[restore-urbis] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
fi

echo "[restore-urbis] Restoring to be2osm database (urbis schema)..."

PSQL="psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm"
export PGPASSWORD="${POSTGRES_PASSWORD}"

# Drop existing tables (full dump recreates them)
${PSQL} -c "DROP MATERIALIZED VIEW IF EXISTS urbis.buildings_with_addresses CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.buildings CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.addresses CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.placenames CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.municipalities CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.postalzip CASCADE;" || true
${PSQL} -c "DROP TABLE IF EXISTS urbis.import_meta CASCADE;" || true

# Restore full dump (includes CREATE TABLE statements)
gunzip -c "${DUMP_FILE}" | ${PSQL}

# Update statistics
${PSQL} -c "ANALYZE urbis.buildings;" || true
${PSQL} -c "ANALYZE urbis.addresses;" || true

echo "[restore-urbis] Done."
