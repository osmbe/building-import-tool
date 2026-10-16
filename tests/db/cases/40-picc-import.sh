# The local PICC import (FileGDB + ICAR shapefile) builds picc.buildings_with_addresses.
reset_db fresh
fixtures picc
just_run picc-import >/dev/null

assert_eq "$(sql "SELECT count(*) FROM picc.buildings_with_addresses")" "2" "one view row per PICC building"
assert_eq "$(sql "SELECT objectid || ':' || addresses || ':' || postcodes || ':' || municipalities FROM picc.buildings_with_addresses WHERE address_count > 0")" \
    "11:Rue de Fer 5:5000:Namur" "the ICAR address is joined to the building that contains it"
assert_eq "$(sql "SELECT Find_SRID('picc', 'buildings_with_addresses', 'geom')")" "3857" "the view geometry is in EPSG:3857"
assert_true "SELECT area_m2 BETWEEN 40 AND 80 FROM picc.buildings_with_addresses WHERE objectid = 11" \
    "area_m2 is computed in Lambert 72 (m²)"
