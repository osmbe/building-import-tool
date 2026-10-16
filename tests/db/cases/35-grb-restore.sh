# webhook/restore-grb.sh restores the data-only dump of a CI import (made like .github/workflows/grb-import.yml)
# onto a server database, also one that is still on the old schema, and can be run again.
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

restore() { webhook_run webhook bash /repo/webhook/restore-grb.sh "$1" osmbe/building-import-tool 2>&1; }

# An old server: schema of 7088df9 with data of its own
reset_db v7088
psql_db -c "INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
  (9999, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));
  INSERT INTO grb.kunstwerken (oidn, geom) VALUES (9999, ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326));" >/dev/null

out=$(restore 4242) && rc=0 || rc=$?
assert_eq "$rc" "0" "the restore succeeds on an old-schema database"
[ "$rc" = 0 ] || log "$out"
assert_eq "$(snapshot)" "$expected" "the server has exactly the imported data (old rows and KNW replaced)"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "3" "the schema was migrated first"

out=$(restore 4242) && rc=0 || rc=$?
assert_eq "$rc" "0" "restoring again succeeds"
assert_eq "$(snapshot)" "$expected" "a second restore gives the same data (no duplicates)"

# A broken dump makes the restore fail instead of reporting success
echo "INSERT INTO grb.no_such_table VALUES (1);" | gzip | artifact 4343 be2osm-dump be2osm.sql.gz
assert_fails "a dump with an error fails the restore" restore 4343
assert_fails "a run without an artifact fails the restore" restore 4444
