-- Cleanup (data plan P5), step 2: drop the GRB objects nothing reads or writes since the previous release.
-- - grb.address_building_links (RltAdresGebouw): no longer imported; addresses are joined to polygons by geometry
--   (docs/GRB_ADDRESS_JOIN.md). Its foreign key and indexes go with it.
-- - the summary views grb.building_polygons_summary and grb.addresses_summary, and grb.import_statistics: never
--   read (import times are in grb.import_meta).
-- - grb.refresh_buildings_with_addresses(): never called (the recipes refresh the view themselves).
-- No CASCADE: if anything still depended on these objects, the migration must fail instead of dropping it.
DROP VIEW IF EXISTS grb.building_polygons_summary;
DROP VIEW IF EXISTS grb.addresses_summary;
DROP TABLE IF EXISTS grb.address_building_links;
DROP TABLE IF EXISTS grb.import_statistics;
DROP FUNCTION IF EXISTS grb.refresh_buildings_with_addresses();
