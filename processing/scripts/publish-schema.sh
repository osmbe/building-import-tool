#!/usr/bin/env bash
# Publish the schema dump of a CI import: restore it as <schema>_next next to the live schema, check it, then
# swap the two schemas in one short transaction. Tiles and the API keep reading the live data until the swap,
# and a failed or rejected restore leaves the live schema untouched.
#
#   publish-schema.sh <schema> <dump.sql.gz>        (grb, picc or urbis)
#
# The dump must be of <schema>_next (the CI workflow renames the schema before pg_dump). Checks before the swap:
# - the main table has rows, at least 90% of the live count (FORCE=1 skips this);
# - the dump's <schema>_next.schema_migrations matches the migrations of this checkout exactly (same versions
#   and checksums): an artifact built by older or newer code is refused, re-run the import after the deploy.
# Connection: libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD); database be2osm unless PGDATABASE is set.
# Runs from the webhook (restore-*.sh) and the processing container (just *-import-remote).
set -euo pipefail

SCHEMA="${1:?usage: publish-schema.sh <schema> <dump.sql.gz>}"
DUMP="${2:?usage: publish-schema.sh <schema> <dump.sql.gz>}"
NEXT="${SCHEMA}_next"
PREV="${SCHEMA}_prev"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/../sql/migrations" && pwd)/${SCHEMA}"
RETRIES="${PUBLISH_RETRIES:-30}"
export PGDATABASE="${PGDATABASE:-be2osm}"

case "$SCHEMA" in
grb) MAIN_TABLE=building_polygons ;;
picc) MAIN_TABLE=buildings ;;
urbis) MAIN_TABLE=buildings ;;
*)
    echo "publish-schema: unknown schema $SCHEMA" >&2
    exit 2
    ;;
esac

log() { echo "[publish-$SCHEMA] $*"; }
die() {
    echo "[publish-$SCHEMA] ERROR: $*" >&2
    exit 1
}
psql_q() { psql -X -q -tA -v ON_ERROR_STOP=1 "$@"; }
drop_next() { psql_q -c "SET client_min_messages = warning; DROP SCHEMA IF EXISTS ${NEXT} CASCADE" || true; }

# Retry a statement that needs locks held by running queries (renames, drops)
with_retries() { # <sql>
    local attempt out
    for attempt in $(seq 1 "$RETRIES"); do
        if out=$(psql_q -c "SET lock_timeout = '3s'" -c "$1" 2>&1); then
            return 0
        fi
        grep -q 'lock timeout' <<<"$out" || {
            echo "$out" >&2
            return 1
        }
        log "waiting for running queries (attempt $attempt/$RETRIES)"
        sleep 2
    done
    return 1
}

gunzip -t "$DUMP" || die "$DUMP is not a valid gzip file"
# (no pipefail here: grep -q stops reading early)
(set +o pipefail; gunzip -c "$DUMP" | head -c 2000000 | grep -q "^CREATE SCHEMA ${NEXT};") ||
    die "$DUMP is not a dump of ${NEXT} (made by an older import workflow): run the import workflow again"

# 1. Restore next to the live schema
log "restoring ${NEXT}"
drop_next
psql_q -c "SET client_min_messages = warning; DROP SCHEMA IF EXISTS ${PREV} CASCADE" >/dev/null
gunzip -c "$DUMP" | psql -X -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null || {
    drop_next
    die "the restore failed (the live schema is untouched)"
}

# 2. Checks
rows=$(psql_q -c "SELECT count(*) FROM ${NEXT}.${MAIN_TABLE}")
live=$(psql_q -c "SELECT CASE WHEN to_regclass('${SCHEMA}.${MAIN_TABLE}') IS NULL THEN 0 ELSE (SELECT count(*) FROM ${SCHEMA}.${MAIN_TABLE}) END")
log "${NEXT}.${MAIN_TABLE}: ${rows} rows (live: ${live})"
if [ "$rows" -eq 0 ]; then
    drop_next
    die "the dump has no ${MAIN_TABLE}"
fi
if [ "${FORCE:-0}" != 1 ] && [ $((rows * 10)) -lt $((live * 9)) ]; then
    drop_next
    die "the dump has fewer than 90% of the live ${MAIN_TABLE} (${rows} vs ${live}): run with FORCE=1 if that is expected"
fi

expected=""
if [ -d "$MIGRATIONS_DIR" ]; then
    for file in "$MIGRATIONS_DIR"/[0-9]*.sql; do
        [ -e "$file" ] || continue
        expected+="$(basename "$file" .sql) $(sha256sum "$file" | cut -d' ' -f1)"$'\n'
    done
fi
actual="$(psql_q -c "SELECT string_agg(version || ' ' || checksum, E'\n' ORDER BY version) FROM ${NEXT}.schema_migrations" 2>/dev/null || true)"
if [ "${expected%$'\n'}" != "${actual}" ]; then
    drop_next
    echo "   migrations of this checkout:" >&2
    printf '%s' "${expected:-     (none)}" | sed 's/^/     /' >&2
    echo "   migrations of the dump:" >&2
    printf '%s\n' "${actual:-(none)}" | sed 's/^/     /' >&2
    die "the dump was built with other ${SCHEMA} migrations than the deployed code: deploy first, then run the import again"
fi

# 3. Swap
log "swapping ${NEXT} in"
with_retries "BEGIN;
    DO \$\$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = '${SCHEMA}') THEN
            ALTER SCHEMA ${SCHEMA} RENAME TO ${PREV};
        END IF;
    END \$\$;
    ALTER SCHEMA ${NEXT} RENAME TO ${SCHEMA};
    COMMIT;" || die "the swap failed (the live schema is untouched; ${NEXT} is kept for inspection)"

for table in $(psql_q -c "SELECT format('%I.%I', schemaname, tablename) FROM pg_tables WHERE schemaname = '${SCHEMA}'"); do
    psql_q -c "ANALYZE ${table}"
done

# 4. The previous data goes once no running query uses it any more
if with_retries "SET client_min_messages = warning; DROP SCHEMA IF EXISTS ${PREV} CASCADE"; then
    log "previous ${SCHEMA} data dropped"
else
    log "WARNING: ${PREV} is still in use and was kept; the next publish drops it"
fi
log "published ${rows} ${MAIN_TABLE}"
