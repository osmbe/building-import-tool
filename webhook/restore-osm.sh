#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore.sh <run_id> <repo>}"
REPO="${2:?Usage: restore.sh <run_id> <repo>}"

WORK_DIR="/tmp/osm-restore"

echo "[restore] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n osmbe-dump -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/osmbe.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
  echo "[restore] ERROR: dump file not found at ${DUMP_FILE}" >&2
  exit 1
fi

echo "[restore] Restoring to osmbe database..."

PSQL="psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d osmbe"
export PGPASSWORD="${POSTGRES_PASSWORD}"

${PSQL} -c "TRUNCATE osm.osm_buildings CASCADE;" || true
${PSQL} -c "TRUNCATE osm.osm_addresses CASCADE;" || true

gunzip -c "${DUMP_FILE}" | ${PSQL}

${PSQL} -c "ANALYZE osm.osm_buildings; ANALYZE osm.osm_addresses;"

rm -rf "${WORK_DIR}"
echo "[restore] Done."
