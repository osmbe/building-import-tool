#!/usr/bin/env bash
# Apply the schema migrations in sql/migrations/<scope>/NNN_name.sql, in order, to the be2osm database.
#
#   migrate.sh            apply every pending migration
#   migrate.sh --deploy   same, but refuse to start a pending heavy migration (used by automatic deploys)
#   migrate.sh --status   list applied / pending migrations and exit
#
# Connection: the standard libpq variables (PGHOST, PGPORT, PGUSER, PGPASSWORD); the database is be2osm
# unless PGDATABASE is set. Runs from the processing container (`just db-migrate`) and the webhook container.
#
# Rules for migration files:
# - Scopes run in this order: common (tracked in public.schema_migrations), grb, picc, urbis (tracked in
#   <scope>.schema_migrations, so the tracking travels with the schema). Versions are the file names.
# - A file runs in one transaction and is recorded in the same transaction. A file with the line
#   `-- migrate:no-transaction` runs statement by statement (needed for CREATE INDEX CONCURRENTLY or batched
#   updates) and must be safe to re-run if it fails halfway.
# - `-- migrate:heavy` marks a migration that can run for a long time on production data (rebuilding a
#   materialized view, ...). `--deploy` refuses to start it, so a deploy never blocks on it unexpectedly.
# - Applied files must never change: a checksum mismatch stops the run.
# - Every migration is applied under one advisory lock, so concurrent runs (deploy, imports, restores) wait
#   for each other. Lock timeouts on DDL are retried.
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "$0")" && pwd)/migrations"
SCOPES=(common grb picc urbis)
LOCK_KEY="hashtext('be2osm:migrate')"
LOCK_TIMEOUT="${MIGRATE_LOCK_TIMEOUT:-10s}"
RETRIES="${MIGRATE_RETRIES:-30}"
export PGDATABASE="${PGDATABASE:-be2osm}"

MODE=apply
case "${1:-}" in
"") ;;
--deploy) MODE=deploy ;;
--status) MODE=status ;;
*)
    echo "usage: $0 [--deploy|--status]" >&2
    exit 2
    ;;
esac

psql_q() { psql -X -q -tA -v ON_ERROR_STOP=1 "$@"; }

tracking_table() { [ "$1" = common ] && echo public.schema_migrations || echo "$1.schema_migrations"; }

# "<checksum>" of an applied version, or "" when it is not applied (or its schema/table doesn't exist yet)
applied_checksum() { # <scope> <version>
    local table
    table=$(tracking_table "$1")
    psql_q -c "SELECT coalesce((SELECT checksum FROM $table WHERE version = '$2'), '')" 2>/dev/null || true
}

apply_file() { # <scope> <file> <version> <checksum>
    local scope="$1" file="$2" version="$3" checksum="$4" table begin="BEGIN;" commit="COMMIT;" create_schema=""
    table=$(tracking_table "$scope")
    [ "$scope" = common ] || create_schema="CREATE SCHEMA IF NOT EXISTS $scope;"
    if grep -q '^-- migrate:no-transaction' "$file"; then
        begin=""
        commit=""
    fi
    local attempt output
    for attempt in $(seq 1 "$RETRIES"); do
        if output=$(
            psql -X -q -v ON_ERROR_STOP=1 -v version="$version" -v checksum="$checksum" 2>&1 <<SQL
SET client_min_messages = warning;
SELECT pg_advisory_lock($LOCK_KEY) AS locked \gset
$create_schema
CREATE TABLE IF NOT EXISTS $table (
    version TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SELECT NOT EXISTS (SELECT 1 FROM $table WHERE version = :'version') AS pending \gset
\if :pending
SET lock_timeout = '$LOCK_TIMEOUT';
$begin
\i $file
INSERT INTO $table (version, checksum) VALUES (:'version', :'checksum');
$commit
\endif
SQL
        ); then
            [ -z "$output" ] || printf '%s\n' "$output"
            return 0
        fi
        if grep -q 'lock timeout' <<<"$output" && [ "$attempt" -lt "$RETRIES" ]; then
            echo "   ⏳ $scope/$version waits for a lock held by running queries (attempt $attempt/$RETRIES), retrying..."
            sleep 2
            continue
        fi
        printf '%s\n' "$output" >&2
        return 1
    done
}

STATUS=0
for scope in "${SCOPES[@]}"; do
    dir="$MIGRATIONS_DIR/$scope"
    [ -d "$dir" ] || continue
    for file in "$dir"/[0-9]*.sql; do
        [ -e "$file" ] || continue
        version="$(basename "$file" .sql)"
        checksum="$(sha256sum "$file" | cut -d' ' -f1)"
        applied="$(applied_checksum "$scope" "$version")"
        heavy=""
        grep -q '^-- migrate:heavy' "$file" && heavy=" (heavy)"

        if [ -n "$applied" ]; then
            if [ "$applied" != "$checksum" ]; then
                echo "❌ $scope/$version was applied with a different checksum: applied migrations must not change." >&2
                echo "   Add a new migration instead." >&2
                exit 1
            fi
            [ "$MODE" = status ] && echo "   applied  $scope/$version"
            continue
        fi

        case "$MODE" in
        status)
            echo "   pending  $scope/$version$heavy"
            STATUS=3
            ;;
        deploy)
            if [ -n "$heavy" ]; then
                echo "❌ $scope/$version is a heavy migration and is not applied yet. Deploys don't start heavy" >&2
                echo "   migrations: run \`just db-migrate\` on the server first (see docs/RUNBOOK.md)." >&2
                exit 1
            fi
            ;&
        apply)
            echo "🔧 $scope/$version$heavy"
            apply_file "$scope" "$file" "$version" "$checksum"
            ;;
        esac
    done
done

if [ "$MODE" = status ]; then
    [ "$STATUS" = 0 ] && echo "✅ every migration is applied" || echo "⚠️  pending migrations"
    exit 0
fi
echo "✅ migrations applied"
