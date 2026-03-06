#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: restore-picc.sh <run_id> <repo>}"
REPO="${2:?Usage: restore-picc.sh <run_id> <repo>}"

WORK_DIR="/tmp/picc-restore"

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

${PSQL} -c "TRUNCATE picc.addresses CASCADE;" || true

gunzip -c "${DUMP_FILE}" | ${PSQL}

${PSQL} -c "ANALYZE picc.addresses;" || true

rm -rf "${WORK_DIR}"
echo "[restore-picc] Done."
