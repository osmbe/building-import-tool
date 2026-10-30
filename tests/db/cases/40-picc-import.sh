# The local PICC import (FileGDB + ICAR shapefile): raw ogr2ogr tables are mapped into the migration-owned
# picc.buildings / picc.addresses, the view is refreshed, and the import does not change the schema.
reset_db fresh
just_run db-migrate >/dev/null
before=$(schema_of picc)
fixtures picc
just_run picc-import >/dev/null 2>&1

assert_eq "$(sql "SELECT count(*) FROM picc.buildings_with_addresses")" "2" "one view row per PICC building"
assert_eq "$(sql "SELECT objectid || ':' || addresses || ':' || postcodes || ':' || municipalities FROM picc.buildings_with_addresses WHERE address_count > 0")" \
    "11:Rue de Fer 5:5000:Namur" "the ICAR address is joined to the building that contains it"
assert_eq "$(sql "SELECT Find_SRID('picc', 'buildings_with_addresses', 'geom')")" "3857" "the view geometry is in EPSG:3857"
assert_true "SELECT area_m2 BETWEEN 40 AND 80 FROM picc.buildings_with_addresses WHERE objectid = 11" \
    "area_m2 is computed in Lambert 72 (m²)"
assert_eq "$(sql "SELECT string_agg(fid || '=' || objectid || ':' || date_leve, ',' ORDER BY fid) FROM picc.buildings")" \
    "11=11:2019-05-20,12=12:2018-02-03" "picc.buildings: fid = objectid, survey dates as dates"
assert_eq "$(sql "SELECT street || '|' || house_number || '|' || postcode || '|' || municipality FROM picc.addresses")" \
    "Rue de Fer|5|5000|Namur" "picc.addresses has the normalised ICAR address"
assert_eq "$(sql "SELECT count(*) FROM pg_tables WHERE schemaname = 'picc' AND tablename LIKE '\_raw%'")" "0" \
    "no raw table is left behind"
after=$(schema_of picc)
if [ "$before" = "$after" ]; then pass "the import does not change the schema"; else
    fail "the import changed the schema:"
    diff <(echo "$before") <(echo "$after") | head -20 | sed 's/^/      /'
fi

# Importing again replaces the data instead of adding to it
fixtures picc
just_run picc-import >/dev/null 2>&1
assert_eq "$(sql "SELECT (SELECT count(*) FROM picc.buildings) || '/' || (SELECT count(*) FROM picc.addresses) || '/' || (SELECT count(*) FROM picc.buildings_with_addresses)")" \
    "2/1/2" "a second import replaces the data"
