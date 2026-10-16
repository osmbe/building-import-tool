#!/usr/bin/env bash
# Database, recipe and Martin tests against a throwaway copy of the production stack (docker-compose.test.yml).
#
#   tests/db/run.sh          # every case in tests/db/cases/
#   tests/db/run.sh 20 30    # only cases whose file name starts with 20 or 30
#   KEEP=1 tests/db/run.sh   # leave the stack running afterwards (inspect with `docker compose -f docker-compose.test.yml ...`)
#
# Needs Docker with Compose v2, python3 and curl. On Apple Silicon the PostGIS image runs under emulation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export ROOT
# shellcheck source=tests/db/lib.sh
source "$ROOT/tests/db/lib.sh"

cleanup() {
    if [ "${KEEP:-0}" != "1" ]; then
        "${COMPOSE[@]}" --profile martin --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

echo "▶ Starting the test stack"
"${COMPOSE[@]}" --profile martin --profile tools down -v --remove-orphans >/dev/null 2>&1 || true
if [ "${SKIP_BUILD:-0}" != "1" ]; then
    "${COMPOSE[@]}" build processing webhook >/dev/null
fi
"${COMPOSE[@]}" up -d --wait postgres >/dev/null

echo "▶ Preparing base databases"
# fresh: exactly what the production init scripts create
psql_db -d postgres -c "CREATE DATABASE be2osm_fresh TEMPLATE be2osm" >/dev/null
# v7088: the GRB schema before migration 001 (commit 7088df9) and its FDW to osmbe, current PICC/Urbis schemas
psql_db -d postgres -c "CREATE DATABASE be2osm_v7088" >/dev/null
psql_db -d be2osm_v7088 -f - <"$ROOT/tests/db/schemas/be2osm-grb-7088df9.sql" >/dev/null
psql_db -d be2osm_v7088 -f - <"$ROOT/tests/db/schemas/be2osm-fdw-7088df9.sql" >/dev/null
sed '/^\\c be2osm/d' "$ROOT/postgres/05-setup-picc.sql" | psql_db -d be2osm_v7088 -f - >/dev/null
sed '/^\\c be2osm/d' "$ROOT/postgres/06-setup-urbis.sql" | psql_db -d be2osm_v7088 -f - >/dev/null
# production: the schema snapshot taken by scripts/server-bootstrap.sh, when it has been committed
if [ -f "$ROOT/tests/db/schemas/be2osm-production.sql" ]; then
    psql_db -d postgres -c "CREATE DATABASE be2osm_production" >/dev/null
    sed "s/'REDACTED'/'be2osm'/g" "$ROOT/tests/db/schemas/be2osm-production.sql" | psql_db -d be2osm_production -f - >/dev/null
fi

FAILED=()
for case_file in "$ROOT"/tests/db/cases/*.sh; do
    name="$(basename "$case_file" .sh)"
    if [ "$#" -gt 0 ]; then
        selected=0
        for prefix in "$@"; do [[ "$name" == "$prefix"* ]] && selected=1; done
        [ "$selected" = 1 ] || continue
    fi
    echo "▶ $name"
    if ! bash -c "set -euo pipefail; source '$ROOT/tests/db/lib.sh'; source '$case_file'; exit \$CASE_FAILURES"; then
        FAILED+=("$name")
    fi
done

echo
if [ "${#FAILED[@]}" -gt 0 ]; then
    printf '\033[31m✗ %d case(s) failed:\033[0m %s\n' "${#FAILED[@]}" "${FAILED[*]}"
    exit 1
fi
printf '\033[32m✓ all database cases passed\033[0m\n'
