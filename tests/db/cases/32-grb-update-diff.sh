# The GRB differential update applies a difference download (delete + add file per entity) in one transaction:
# a changed polygon gets its new version and keeps its gebouw_id, a removed one disappears, a new one is added.
# Applying the same diff twice gives the same result. The next diff starts from the date in grb.import_meta.
reset_db fresh
fixtures grb
just_run grb-import >/dev/null 2>&1

polygons() {
    sql "SELECT string_agg(entity || '/' || oidn || ':' || uidn || ':' || coalesce(gebouw_id::text, '-') || ':' || survey_date, ',' ORDER BY entity DESC, oidn) FROM grb.building_polygons"
}
assert_eq "$(polygons)" "Gbg/1001:10010:5001:2023-03-15,Gbg/1002:10020:5001:2021-06-30,Gbg/1003:10030:5002:2023-03-15,Gba/1001:10010:-:2023-03-15,Gba/2001:20010:-:2023-03-15,Gba/3001:30010:-:2023-03-15" \
    "before: the full import"

expected="Gbg/1001:10011:5001:2026-05-04,Gbg/1003:10030:5002:2023-03-15,Gbg/1004:10040:-:2026-09-01,Gba/1001:10010:-:2023-03-15,Gba/2001:20010:-:2023-03-15,Gba/3001:30010:-:2023-03-15"
fixtures grb-diff
out=$(just_run _grb-import-diff-building-polygons 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "the diff is applied"
[ "$rc" = 0 ] || log "$out"
assert_eq "$(polygons)" "$expected" "1001 changed (gebouw_id kept), 1002 removed, 1004 added, GBA untouched"
grep -q "removed: 1, changed: 1, added (or already present): 1" <<<"$out" \
    && pass "the counts are reported" || fail "the counts are reported: $out"
assert_true "SELECT ST_Area(geom) > 0 FROM grb.candidates WHERE source_ref = 'Gbg/1001'" \
    "the view is refreshed with the changed polygon"
assert_true "SELECT to_regclass('grb._diff_add') IS NULL AND to_regclass('grb._diff_del') IS NULL AND to_regclass('grb._diff_load') IS NULL" \
    "no staging table is left behind"

fixtures grb-diff
just_run _grb-import-diff-building-polygons >/dev/null 2>&1
assert_eq "$(polygons)" "$expected" "applying the same diff again changes nothing"

# A diff that fails halfway (an add file without the GRB columns) changes nothing
fixtures grb-diff
"${COMPOSE[@]}" run --rm -T --entrypoint bash processing -c \
    'ogr2ogr -f "ESRI Shapefile" data/grb/gbg-diff/GbgAdd_test.shp /fixtures/grb/addresses.geojson -overwrite' >/dev/null 2>&1
assert_fails "a broken diff fails the update" just_run _grb-import-diff-building-polygons
assert_eq "$(polygons)" "$expected" "and leaves the polygons as they were"

psql_db -c "DELETE FROM grb.import_meta; INSERT INTO grb.import_meta VALUES ('2026-10-01 18:30:00+00')" >/dev/null
assert_eq "$(just_run _grb-get-last-update 2>/dev/null)" "2026-10-01T00:00:00Z" "the next diff starts on the day of the last import"
