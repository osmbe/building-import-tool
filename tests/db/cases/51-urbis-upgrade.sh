#!/usr/bin/env bash
# A server database imported by the old recipes (raw tables urbis.buildings, urbis.addresses, ... with the
# GeoPackage columns, built with the justfile of 09b98f1) is migrated: same view contents, on the new tables.
reset_db fresh
fixtures urbis
out=$(old_just 09b98f18eef496bd57b303c65e70fad71a2e747d urbis-import 2>&1) || {
  fail "the old recipes ran"
  printf '%s\n' "$out" | tail -20
  return
}
view() { sql "SELECT string_agg(building_id || ':' || inspire_id || ':' || block_id || ':' || addresses || ':' || postcodes || ':' || municipalities || ':' || address_count || ':' || round(area_m2), ',' ORDER BY building_id) FROM urbis.buildings_with_addresses"; }
before=$(view)
assert_true "SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'urbis.buildings'::regclass AND attname = 'inspire_id')" \
  "the old recipes built the old layout"

just_run db-migrate >/dev/null 2>&1
assert_eq "$(view)" "$before" "after the migration the view has the same contents"
assert_eq "$(sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'urbis' AND tablename LIKE '\_legacy%'")" "0" \
  "the old raw tables are dropped"
assert_eq "$(sql "SELECT count(*) FROM urbis.addresses")" "2" "the addresses were moved to urbis.addresses"
