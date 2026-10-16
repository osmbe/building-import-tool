-- OSM buildings (osmbe) next to the GRB/PICC/Urbis fixtures, each exercising one matching rule.
-- Fixture squares are 0.0001° wide and 0.000065° high (see tests/fixtures/*/*.geojson).
INSERT INTO osm.osm_buildings (osm_id, building_type, tags, geom) VALUES
  -- Same outline as Gbg/1001: hides it in geometry mode
  (101, 'yes', '{"building": "yes"}',
   ST_GeomFromText('POLYGON((4.4000 51.2000,4.4001 51.2000,4.4001 51.200065,4.4000 51.200065,4.4000 51.2000))', 4326)),
  -- Elsewhere, tagged with Gbg/1002: hides Gbg/1002 in source mode
  (102, 'yes', '{"building": "yes", "source:geometry:ref": "Gbg/1002"}',
   ST_GeomFromText('POLYGON((4.4100 51.2000,4.4101 51.2000,4.4101 51.200065,4.4100 51.200065,4.4100 51.2000))', 4326)),
  -- Elsewhere, tagged with Gba/1001: hides Gba/1001 but not Gbg/1001 (OIDNs are unique per entity)
  (103, 'yes', '{"building": "yes", "source:geometry:ref": "Gba/1001"}',
   ST_GeomFromText('POLYGON((4.4110 51.2000,4.4111 51.2000,4.4111 51.200065,4.4110 51.200065,4.4110 51.2000))', 4326)),
  -- Same outline as PICC objectid 12
  (201, 'yes', '{"building": "yes"}',
   ST_GeomFromText('POLYGON((4.8710 50.4650,4.8711 50.4650,4.8711 50.465065,4.8710 50.465065,4.8710 50.4650))', 4326)),
  -- Same outline as Urbis building 22
  (301, 'yes', '{"building": "yes"}',
   ST_GeomFromText('POLYGON((4.3510 50.8460,4.3511 50.8460,4.3511 50.846065,4.3510 50.846065,4.3510 50.8460))', 4326));
