#!/usr/bin/env bash
# webhook/restore-picc.sh publishes the dump of a CI PICC import (schema picc_next, like
# .github/workflows/picc-import.yml): restored next to the live data, checked, swapped in.
reset_db fresh
fixtures picc
just_run picc-import >/dev/null 2>&1
psql_db -c "ALTER SCHEMA picc RENAME TO picc_next" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n picc_next be2osm | gzip | artifact 6100 picc-dump picc.sql.gz
# The same with other migration checksums (built by other code)
psql_db -c "UPDATE picc_next.schema_migrations SET checksum = 'other' WHERE version = '001_tables'" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n picc_next be2osm | gzip | artifact 6101 picc-dump picc.sql.gz
# An old-format dump (schema picc)
psql_db -c "ALTER SCHEMA picc_next RENAME TO picc" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n picc be2osm | gzip | artifact 6102 picc-dump picc.sql.gz

restore() { webhook_run -e RESTART_TILES=0 webhook bash /repo/webhook/restore-picc.sh "$1" osmbe/building-import-tool 2>&1; }

# The "server": migrated, with one building of its own
reset_db fresh
just_run db-migrate >/dev/null
psql_db -c "INSERT INTO picc.buildings (fid, objectid, geom) VALUES
  (99, 99, ST_Multi(ST_Transform(ST_MakeEnvelope(4.86, 50.46, 4.8601, 50.46007, 4326), 31370)));
  REFRESH MATERIALIZED VIEW picc.buildings_with_addresses" >/dev/null

# A long read of the live view during the restore must not block it
psql_db -c "BEGIN; SELECT count(*) FROM picc.buildings_with_addresses; SELECT pg_sleep(8); COMMIT;" >/dev/null &
reader=$!
out=$(restore 6100) && rc=0 || rc=$?
assert_eq "$rc" "0" "the restore succeeds while the live view is being read"
[ "$rc" = 0 ] || log "$out"
wait "$reader" || true
assert_eq "$(sql "SELECT string_agg(objectid::text, ',' ORDER BY objectid) FROM picc.buildings_with_addresses")" "11,12" \
  "the live schema has the dump's data"
assert_eq "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname IN ('picc_next', 'picc_prev')")" "0" \
  "nothing is left next to it"
assert_eq "$(sql "SELECT count(*) FROM picc.schema_migrations")" "$(migration_count picc)" "the migration tracking came with it"
assert_true "SELECT imported_at IS NOT NULL FROM picc.import_meta" "and the import time"

for run in 6101 6102 6199; do
  out=$(restore "$run") && rc=0 || rc=$?
  case "$run" in
  6101) what="a dump built with other migrations" ;;
  6102) what="an old-format dump (schema picc)" ;;
  6199) what="a run without an artifact" ;;
  esac
  assert_eq "$rc" "1" "$what is refused"
  assert_eq "$(sql "SELECT string_agg(objectid::text, ',' ORDER BY objectid) FROM picc.buildings_with_addresses")" "11,12" \
    "  and the live data is untouched"
done
grep -q "deploy first" <<<"$(restore 6101)" && pass "the migration mismatch says what to do" || fail "the migration mismatch says what to do"
assert_eq "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname = 'picc_next'")" "0" "a refused dump is dropped"

# Fewer than 90% of the live buildings is refused unless forced
psql_db -c "INSERT INTO picc.buildings (fid, objectid, geom) SELECT 1000 + g, 1000 + g, ST_Multi(ST_Transform(ST_MakeEnvelope(4.86, 50.46, 4.8601, 50.46007, 4326), 31370)) FROM generate_series(1, 10) g" >/dev/null
out=$(restore 6100) && rc=0 || rc=$?
assert_eq "$rc" "1" "a dump with far fewer buildings than the live data is refused"
out=$(webhook_run -e RESTART_TILES=0 -e FORCE=1 webhook bash /repo/webhook/restore-picc.sh 6100 osmbe/building-import-tool 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "FORCE=1 publishes it anyway"
