# The local UrbIS import (GeoPackage): raw ogr2ogr layers are mapped into the migration-owned urbis.buildings /
# urbis.addresses (streets and municipalities resolved by id), the view is refreshed, and the import does not
# change the schema. Importing again replaces the data, so urbis-update (a full re-download) is safe.
reset_db fresh
just_run db-migrate >/dev/null
before=$(schema_of urbis)
fixtures urbis
just_run urbis-import >/dev/null 2>&1

assert_eq "$(sql "SELECT string_agg(building_id::text, ',' ORDER BY building_id) FROM urbis.buildings_with_addresses")" "21,22" \
  "building ids are the GeoPackage FIDs that addresses.bu_id refers to"
assert_eq "$(sql "SELECT building_id || ':' || address_count || ':' || addresses || ':' || street_names || ':' || postcodes || ':' || municipalities FROM urbis.buildings_with_addresses WHERE address_count > 0")" \
  "21:2:Rue Neuve 10; Rue Neuve 10/2:Rue Neuve:1000:Bruxelles" "addresses are joined by building id, with box numbers"
assert_eq "$(sql "SELECT pg_typeof(inspire_id)::text || '/' || pg_typeof(building_id)::text FROM urbis.buildings_with_addresses LIMIT 1")" \
  "integer/bigint" "the view keeps its column types"
assert_eq "$(sql "SELECT string_agg(street || '|' || house_number || '|' || coalesce(box, '-') || '|' || postcode || '|' || municipality, ',' ORDER BY address_id) FROM urbis.addresses")" \
  "Rue Neuve|10|-|1000|Bruxelles,Rue Neuve|10|2|1000|Bruxelles" "urbis.addresses has the resolved addresses"
assert_true "SELECT imported_at IS NOT NULL FROM urbis.import_meta" "the import time is recorded"
assert_eq "$(sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'urbis' AND tablename LIKE '\_raw%'")" "0" \
  "no raw table is left behind"
after=$(schema_of urbis)
if [ "$before" = "$after" ]; then pass "the import does not change the schema"; else
  fail "the import changed the schema:"
  diff <(echo "$before") <(echo "$after") | head -20 | sed 's/^/      /'
fi

fixtures urbis
just_run urbis-import >/dev/null 2>&1
assert_eq "$(sql "SELECT (SELECT count(*) FROM urbis.buildings) || '/' || (SELECT count(*) FROM urbis.addresses) || '/' || (SELECT count(*) FROM urbis.buildings_with_addresses)")" \
  "2/2/2" "a second import replaces the data"
