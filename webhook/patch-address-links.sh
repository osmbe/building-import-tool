#!/bin/bash
set -euo pipefail

RUN_ID="${1:?Usage: patch-address-links.sh <run_id> <repo>}"
REPO="${2:?Usage: patch-address-links.sh <run_id> <repo>}"

WORK_DIR="/tmp/address-links-patch"

echo "[patch-address-links] Downloading artifact from run ${RUN_ID} (${REPO})..."
rm -rf "${WORK_DIR}"
mkdir -p "${WORK_DIR}"

gh run download "${RUN_ID}" -R "${REPO}" -n address-links-patch -D "${WORK_DIR}"

DUMP_FILE="${WORK_DIR}/address-links-patch.sql.gz"
if [ ! -f "${DUMP_FILE}" ]; then
    echo "[patch-address-links] ERROR: dump file not found at ${DUMP_FILE}" >&2
    exit 1
fi

PSQL="psql -h ${POSTGRES_HOST} -p ${POSTGRES_PORT} -U ${POSTGRES_USER} -d be2osm"
export PGPASSWORD="${POSTGRES_PASSWORD}"

echo "[patch-address-links] Truncating address_building_links..."
${PSQL} -c "TRUNCATE grb.address_building_links;"

echo "[patch-address-links] Restoring address-building links..."
gunzip -c "${DUMP_FILE}" | ${PSQL}

echo "[patch-address-links] Analyzing and refreshing materialized view..."
${PSQL} -c "ANALYZE grb.address_building_links;"
${PSQL} -c "SELECT refresh_buildings_with_addresses();"

rm -rf "${WORK_DIR}"
echo "[patch-address-links] Done."
