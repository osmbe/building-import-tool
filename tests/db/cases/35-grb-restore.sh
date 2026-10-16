# webhook/restore-grb.sh publishes the dump of a CI GRB import (schema grb_next, like
# .github/workflows/grb-import.yml): restored next to the live data, checked, swapped in.
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
psql_db -c "INSERT INTO grb.building_polygons (oidn, geom, updated_at) VALUES
  (9998, ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326), '2000-01-01')" >/dev/null
assert_true "SELECT updated_at > '2000-01-02' FROM grb.building_polygons WHERE oidn = 9998" "the triggers of the swapped-in tables work"
assert_true "SELECT relispopulated FROM pg_class WHERE oid = 'grb.buildings_with_addresses'::regclass" "the view is populated"
psql_db -c "DELETE FROM grb.building_polygons WHERE oidn = 9998" >/dev/null

out=$(restore 4251) && rc=0 || rc=$?
assert_eq "$rc" "1" "a dump built with other migrations is refused"
grep -q "deploy first" <<<"$out" && pass "  and says what to do" || fail "  and says what to do"
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"

out=$(restore 4252) && rc=0 || rc=$?
assert_eq "$rc" "1" "a dump without building polygons (KNW-only import) is refused"
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"

# Data-only dumps of the import workflow before 9ebb34c can't be loaded any more (they COPY the columns of the old
# schema): refused with a hint, and the live data stays
out=$(restore 4242) && rc=0 || rc=$?
assert_eq "$rc" "1" "a data-only dump of the previous workflow is refused"
grep -q "Run the GRB Import workflow again" <<<"$out" && pass "  and says what to do" || fail "  and says what to do: $out"
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"

# A broken dump makes the restore fail instead of reporting success
printf 'CREATE SCHEMA grb_next;\nINSERT INTO grb_next.no_such_table VALUES (1);\n' | gzip | artifact 4343 be2osm-dump be2osm.sql.gz
assert_fails "a dump with an error fails the restore" restore 4343
assert_eq "$(snapshot)" "$expected" "  and the live data is untouched"
assert_eq "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname = 'grb_next'")" "0" "  and the partial restore is dropped"
assert_fails "a run without an artifact fails the restore" restore 4444
