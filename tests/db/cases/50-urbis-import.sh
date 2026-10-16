# The local Urbis import (GeoPackage) builds urbis.buildings_with_addresses with an ID-based address join.
reset_db fresh
fixtures urbis
just_run urbis-import >/dev/null

assert_eq "$(sql "SELECT string_agg(building_id::text, ',' ORDER BY building_id) FROM urbis.buildings_with_addresses")" "21,22" \
    "building ids are the GeoPackage FIDs that addresses.bu_id refers to"
assert_eq "$(sql "SELECT building_id || ':' || address_count || ':' || addresses || ':' || street_names || ':' || postcodes || ':' || municipalities FROM urbis.buildings_with_addresses WHERE address_count > 0")" \
    "21:2:Rue Neuve 10; Rue Neuve 10/2:Rue Neuve:1000:Bruxelles" "addresses are joined by building id, with box numbers"
assert_true "SELECT imported_at IS NOT NULL FROM urbis.import_meta" "the import time is recorded"
