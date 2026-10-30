#!/usr/bin/env bash
# The migration runner (processing/sql/migrate.sh, `just db-migrate`): tracking, checksums, the heavy-migration
# guard of deploys, the advisory lock and lock timeouts.

# A database before migration 001, with one polygon in the old view
old_db() {
  reset_db v7088
  psql_db -c "
    INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
     (2664, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));
    REFRESH MATERIALIZED VIEW grb.buildings_with_addresses;" >/dev/null
}

# db-migrate [args] in the processing container; MIGRATE_ENV holds extra `-e K=V` options
migrate() {
  # shellcheck disable=SC2086
  "${COMPOSE[@]}" run --rm -T ${MIGRATE_ENV:-} processing just db-migrate "$@" 2>&1
}

old_db

# --deploy applies the light migrations and refuses the heavy one
out=$(migrate --deploy) && rc=0 || rc=$?
assert_eq "$rc" "1" "db-migrate --deploy fails when a heavy migration is pending"
grep -q "heavy migration" <<<"$out" && pass "the refusal says why" || fail "the refusal says why: $out"
assert_eq "$(sql "SELECT string_agg(version, ',' ORDER BY version) FROM grb.schema_migrations")" \
  "000_baseline,001_polygon_entity,002_polygon_entity_unique" "the light migrations before it are applied"
assert_true "SELECT NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'grb.buildings_with_addresses'::regclass AND attname = 'entity')" \
  "the old view is left in place"
assert_eq "$(sql "SELECT count(*) FROM grb.buildings_with_addresses")" "1" "the old view keeps its data"

out=$(migrate --status) || true
grep -q "pending  grb/003_buildings_with_addresses_entity (heavy)" <<<"$out" &&
  pass "--status lists the pending heavy migration" || fail "--status lists the pending heavy migration: $out"
grep -q "applied  grb/001_polygon_entity" <<<"$out" &&
  pass "--status lists the applied migrations" || fail "--status lists the applied migrations: $out"

# A run waits while another one holds the migration lock
psql_db -c "SELECT pg_advisory_lock(hashtext('be2osm:migrate')); SELECT pg_sleep(5);" >/dev/null &
holder=$!
sleep 1
start=$(date +%s)
out=$(migrate) && rc=0 || rc=$?
elapsed=$(($(date +%s) - start))
wait "$holder"
assert_eq "$rc" "0" "a run started while the migration lock is held succeeds"
assert_true "SELECT $elapsed >= 3" "it waited for the lock (${elapsed}s)"
assert_true "SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'grb.buildings_with_addresses'::regclass AND attname = 'entity')" \
  "the heavy migration swapped in the new view"
assert_true "SELECT to_regclass('grb.buildings_with_addresses_v2') IS NULL" "no v2 view is left behind"
assert_eq "$(sql "SELECT string_agg(indexrelid::regclass::text, ',' ORDER BY indexrelid::regclass::text) FROM pg_index WHERE indrelid = 'grb.buildings_with_addresses'::regclass")" \
  "grb.idx_mv_buildings_with_addresses_entity_oidn,grb.idx_mv_buildings_with_addresses_gebouw_id,grb.idx_mv_buildings_with_addresses_geom,grb.idx_mv_buildings_with_addresses_polygon_id,grb.idx_mv_buildings_with_addresses_polygon_type,grb.idx_mv_buildings_with_addresses_postcodes" \
  "the view's indexes have their final names"
assert_eq "$(sql "SELECT entity || '/' || oidn FROM grb.buildings_with_addresses")" "Gbg/2664" "the new view has the data"

out=$(migrate) && rc=0 || rc=$?
assert_eq "$rc" "0" "a second run succeeds"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "$(migration_count grb)" "nothing is applied twice"

# Changing an applied migration is refused (simulated by changing its recorded checksum)
psql_db -c "UPDATE grb.schema_migrations SET checksum = 'x' WHERE version = '001_polygon_entity'" >/dev/null
out=$(migrate) && rc=0 || rc=$?
assert_eq "$rc" "1" "a checksum mismatch stops the run"
grep -q "different checksum" <<<"$out" && pass "the error names the problem" || fail "the error names the problem: $out"

# A long reader of the view makes the swap wait. With a short lock_timeout the runner gives up and retries
# instead of queueing behind it, which would block every other reader of the view meanwhile.
old_db
migrate --deploy >/dev/null || true
psql_db -c "BEGIN; SELECT count(*) FROM grb.buildings_with_addresses; SELECT pg_sleep(6); COMMIT;" >/dev/null &
reader=$!
sleep 2
out=$(MIGRATE_ENV="-e MIGRATE_LOCK_TIMEOUT=500ms" migrate) && rc=0 || rc=$?
wait "$reader"
assert_eq "$rc" "0" "db-migrate succeeds once the long reader is done"
grep -q "retrying" <<<"$out" && pass "lock timeouts are retried" || fail "lock timeouts are retried: $out"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "$(migration_count grb)" "every migration is applied"
