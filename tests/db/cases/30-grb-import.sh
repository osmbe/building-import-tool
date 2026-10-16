# The full GRB import on fixture shapefiles: GBG + GBA polygons sharing an OIDN are both imported, gebouw_id
# comes from RltGbgGebouw for GBG polygons only, survey dates are converted, addresses join per polygon.
reset_db fresh
fixtures grb
just_run grb-import >/dev/null

assert_eq "$(sql "SELECT string_agg(entity || '/' || oidn, ',' ORDER BY entity DESC, oidn) FROM grb.building_polygons")" \
    "Gbg/1001,Gbg/1002,Gbg/1003,Gba/1001,Gba/2001" "every GBG and GBA polygon is imported, including Gba/1001"
assert_eq "$(sql "SELECT coalesce(gebouw_id::text, '-') FROM grb.building_polygons WHERE entity = 'Gba' AND oidn = 1001")" "-" \
    "RltGbgGebouw does not give Gba/1001 the gebouw_id of Gbg/1001"
assert_eq "$(sql "SELECT gebouw_id FROM grb.building_polygons WHERE entity = 'Gbg' AND oidn = 1001")" "5001" \
    "gebouw_id is set from RltGbgGebouw"
assert_eq "$(sql "SELECT string_agg(entity || '/' || oidn || '=' || survey_date, ',' ORDER BY entity DESC, oidn) FROM grb.building_polygons WHERE oidn IN (1001, 1002)")" \
    "Gbg/1001=2023-03-15,Gbg/1002=2021-06-30,Gba/1001=2023-03-15" "survey dates are converted for GBG and GBA (both input formats)"
assert_eq "$(sql "SELECT count(*) FROM grb.kunstwerken")" "1" "KNW structures are imported"
assert_eq "$(sql "SELECT count(*) FROM grb.buildings_with_addresses")" "5" "the view has one row per polygon"
assert_eq "$(sql "SELECT entity || '/' || oidn || ':' || addresses FROM grb.buildings_with_addresses WHERE address_count > 0")" \
    "Gbg/1001:Kerkstraat 1" "the address is joined to the polygon that contains it"
assert_eq "$(sql "SELECT polygon_count FROM grb.buildings_with_addresses WHERE entity = 'Gbg' AND oidn = 1001")" "2" \
    "parent building stats come from grb.buildings"
assert_true "SELECT imported_at IS NOT NULL FROM grb.import_meta" "the import time is recorded"
assert_eq "$(sql "SELECT string_agg(gebouw_id || ':' || polygon_count || ':' || GeometryType(geom), ',' ORDER BY gebouw_id) FROM grb.buildings")" \
    "5001:2:MULTIPOLYGON,5002:1:MULTIPOLYGON" "buildings aggregate per gebouw_id (single-polygon buildings too)"
