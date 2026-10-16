# A server database imported by the old recipes (raw ogr2ogr tables picc.constr_batiemprise / picc.icar_adr_pt and
# their view, built with the justfile of b8a1c9c) is migrated: same view contents, on the new tables.
reset_db fresh
fixtures picc
out=$(old_just b8a1c9c3113e6c37c48e34c76529bee0693a9e4f picc-import 2>&1) || {
    fail "the old recipes ran"
    printf '%s\n' "$out" | tail -20
    return
}
view() { sql "SELECT string_agg(objectid || ':' || natur_code || ':' || addresses || ':' || postcodes || ':' || address_count || ':' || round(area_m2), ',' ORDER BY objectid) FROM picc.buildings_with_addresses"; }
before=$(view)
assert_eq "$before" "11:BAT:Rue de Fer 5:5000:1:51,12:ANX:::0:51" "the old recipes built the old layout"

just_run db-migrate >/dev/null 2>&1
assert_eq "$(view)" "$before" "after the migration the view has the same contents"
assert_eq "$(sql "SELECT count(*) FROM picc.buildings")" "2" "the buildings were moved to picc.buildings"
assert_true "SELECT to_regclass('picc.constr_batiemprise') IS NULL AND to_regclass('picc.icar_adr_pt') IS NULL" \
    "the old raw tables are dropped"
assert_true "SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'picc.buildings_with_addresses'::regclass AND attname = 'fid')" \
    "the view is the new one"
