# Upgrading a database from before migration 001 (GRB schema of 7088df9) keeps its data, backfills the entity
# from the type label and rebuilds the view with entity and polygon_id.
reset_db v7088

psql_db -c "
INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
 (2664, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326)),
 (2665, 'verdieping',  ST_GeomFromText('POLYGON((4.41 51.20,4.4101 51.20,4.4101 51.2001,4.41 51.2001,4.41 51.20))', 4326)),
 (2666, NULL,          ST_GeomFromText('POLYGON((4.42 51.20,4.4201 51.20,4.4201 51.2001,4.42 51.2001,4.42 51.20))', 4326));
INSERT INTO grb.addresses (oidn, adres_id, full_address, street_name, postcode, municipality, geom)
VALUES (1, 1, 'Kerkstraat 1', 'Kerkstraat', '2000', 'Antwerpen', ST_SetSRID(ST_MakePoint(4.40005, 51.20005), 4326));
REFRESH MATERIALIZED VIEW grb.buildings_with_addresses;" >/dev/null

just_run db-migrate >/dev/null
just_run db-migrate >/dev/null
assert_eq "$(sql "SELECT string_agg(entity || '/' || oidn, ',' ORDER BY oidn) FROM grb.building_polygons")" \
    "Gbg/2664,Gba/2665,Gbg/2666" "entity backfilled from the type label (unlabelled = Gbg)"
assert_eq "$(sql "SELECT count(*) FROM grb.buildings_with_addresses")" "3" "the view is rebuilt with every polygon"
assert_eq "$(sql "SELECT address_count FROM grb.buildings_with_addresses WHERE entity = 'Gbg' AND oidn = 2664")" "1" \
    "addresses are still joined per polygon"

psql_db -c "INSERT INTO grb.building_polygons (entity, oidn, type_label, geom)
  VALUES ('Gba', 2664, 'trap', ST_GeomFromText('POLYGON((4.43 51.20,4.4301 51.20,4.4301 51.2001,4.43 51.2001,4.43 51.20))', 4326))" >/dev/null
assert_eq "$(sql "SELECT count(*) FROM grb.building_polygons WHERE oidn = 2664")" "2" \
    "a GBA polygon can now share its OIDN with a GBG polygon"
assert_fails "an unknown entity is rejected" \
    sql "INSERT INTO grb.building_polygons (entity, oidn, geom) VALUES ('Xyz', 1, ST_GeomFromText('POLYGON((4 51,4.1 51,4.1 51.1,4 51))', 4326))"
