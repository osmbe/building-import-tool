# webhook/restore-grb.sh publishes the dump of a CI GRB import (schema grb_next, like
# .github/workflows/grb-import.yml): restored next to the live data, checked, swapped in. Data-only dumps of the
# previous workflow (artifacts are kept 7 days) still restore the old way: empty, migrate, load, refresh.
reset_db fresh
fixtures grb
just_run grb-import >/dev/null

snapshot() {
    sql "SELECT (SELECT string_agg(entity || '/' || oidn || ':' || coalesce(gebouw_id::text, '-'), ',' ORDER BY entity, oidn) FROM grb.building_polygons)
        || ' | ' || (SELECT count(*) FROM grb.kunstwerken) || ' knw | ' || (SELECT count(*) FROM grb.addresses) || ' addresses | '
        || (SELECT count(*) FROM grb.buildings_with_addresses) || ' view rows | ' || (SELECT count(*) FROM grb.import_meta) || ' meta'"
}
expected=$(snapshot)

"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --data-only --disable-triggers --no-owner --no-acl \
    -n grb --exclude-table-data=grb.schema_migrations be2osm | gzip | artifact 4242 be2osm-dump be2osm.sql.gz

# Full dumps of grb_next, as the import workflow makes them
psql_db -c "ALTER SCHEMA grb RENAME TO grb_next" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n grb_next be2osm | gzip | artifact 4250 be2osm-dump be2osm.sql.gz
checksum=$(sql "SELECT checksum FROM grb_next.schema_migrations WHERE version = '000_baseline'")
psql_db -c "UPDATE grb_next.schema_migrations SET checksum = 'other' WHERE version = '000_baseline'" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n grb_next be2osm | gzip | artifact 4251 be2osm-dump be2osm.sql.gz
# A KNW-only import (products=knw) has no building polygons
psql_db -c "UPDATE grb_next.schema_migrations SET checksum = '$checksum' WHERE version = '000_baseline';
  DELETE FROM grb_next.building_polygons" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n grb_next be2osm | gzip | artifact 4252 be2osm-dump be2osm.sql.gz

restore() { webhook_run -e RESTART_TILES=0 webhook bash /repo/webhook/restore-grb.sh "$1" osmbe/building-import-tool 2>&1; }

# The server: an old database, migrated by the bootstrap, with a polygon of its own
reset_db v7088
just_run db-migrate >/dev/null
psql_db -c "INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
  (9999, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));
  REFRESH MATERIALIZED VIEW grb.buildings_with_addresses" >/dev/null

# A long read of the live view during the restore must not block it
psql_db -c "BEGIN; SELECT count(*) FROM grb.buildings_with_addresses; SELECT pg_sleep(8); COMMIT;" >/dev/null &
reader=$!
out=$(restore 4250) && rc=0 || rc=$?
assert_eq "$rc" "0" "the restore succeeds while the live view is being read"
[ "$rc" = 0 ] || log "$out"
wait "$reader" || true
assert_eq "$(snapshot)" "$expected" "the live schema has exactly the imported data"
assert_eq "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname IN ('grb_next', 'grb_prev')")" "0" "nothing is left next to it"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "$(migration_count grb)" "the migration tracking came with it"
psql_db -c "INSERT INTO grb.building_polygons (oidn, geom) VALUES
  (9998, ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326))" >/dev/null
assert_true "SELECT geom_mercator IS NOT NULL FROM grb.building_polygons WHERE oidn = 9998" "the triggers of the swapped-in tables work"
assert_true "SELECT relispopulated FROM pg_class WHERE oid = 'grb.buildings_with_addresses'::regclass" "the view is populated"
psql_db -c "DELETE FROM grb.building_polygons WHERE oidn = 9998" >/dev/null

out=$(restore 4251) && rc=0 || rc=$?
assert_eq "$rc" "1" "a dump built with other migrations is refused"
grep -q "deploy first" <<<"$out" && pass "  and says what to do" || fail "  and says what to do"
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"

out=$(restore 4252) && rc=0 || rc=$?
assert_eq "$rc" "1" "a dump without building polygons (KNW-only import) is refused"
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"

# Data-only dumps of the previous import workflow, onto an old server (schema of 7088df9) with data of its own
reset_db v7088
psql_db -c "INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
  (9999, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));
  INSERT INTO grb.kunstwerken (oidn, geom) VALUES (9999, ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));" >/dev/null

out=$(restore 4242) && rc=0 || rc=$?
assert_eq "$rc" "0" "the restore succeeds on an old-schema database"
[ "$rc" = 0 ] || log "$out"
assert_eq "$(snapshot)" "$expected" "the server has exactly the imported data (old rows and KNW replaced)"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "$(migration_count grb)" "the schema was migrated first"

out=$(restore 4242) && rc=0 || rc=$?
assert_eq "$rc" "0" "restoring again succeeds"
assert_eq "$(snapshot)" "$expected" "a second restore gives the same data (no duplicates)"

# A broken dump makes the restore fail instead of reporting success
echo "INSERT INTO grb.no_such_table VALUES (1);" | gzip | artifact 4343 be2osm-dump be2osm.sql.gz
assert_fails "a dump with an error fails the restore" restore 4343
assert_fails "a run without an artifact fails the restore" restore 4444
