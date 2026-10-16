-- Geometry stored once (data plan P4), step 2: drop the copies that 005 stopped writing (grb.building_polygons,
-- grb.addresses and grb.buildings geom_mercator, grb.buildings geom) and their indexes.
--
-- DROP COLUMN only changes the catalog (a short exclusive lock, retried on lock timeout; tiles and the API read
-- the views, not these tables). The disk space comes back when the tables are rewritten: the next GRB import
-- publishes a new schema, built without the columns.
ALTER TABLE grb.building_polygons DROP COLUMN IF EXISTS geom_mercator;
ALTER TABLE grb.addresses DROP COLUMN IF EXISTS geom_mercator;
ALTER TABLE grb.buildings DROP COLUMN IF EXISTS geom_mercator, DROP COLUMN IF EXISTS geom;
