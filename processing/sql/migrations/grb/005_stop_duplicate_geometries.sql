-- Geometry stored once (data plan P4), step 1: stop writing the copies nobody reads.
--
-- grb.building_polygons, grb.addresses and grb.buildings kept a Web Mercator copy of their geometry
-- (geom_mercator, filled by these triggers) and grb.buildings the union of its polygons (geom, computed by the
-- aggregation recipe). Tiles and the difference API read the 3857 geometry of grb.buildings_with_addresses
-- (through grb.candidates) instead. From here on the triggers only set updated_at and the recipes no longer write
-- the copies; step 2 (006) drops the columns. Existing values stay until then (no rewrite of the live tables).
-- grb.kunstwerken keeps its geom_mercator: grb.knw_candidates and the KNW tile sources read it.

CREATE OR REPLACE FUNCTION public.update_building_polygon()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_address()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_building()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
