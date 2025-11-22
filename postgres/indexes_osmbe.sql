-- Performance indexes for osmbe database
-- Run this on: osmbe database
-- This is the REMOTE database where the actual OSM buildings data lives

-- ============================================================================
-- OSM Buildings Indexes (actual table in osmbe)
-- ============================================================================

-- Spatial index on geometry in EPSG:3857 (most important!)
CREATE INDEX IF NOT EXISTS idx_osm_buildings_geometry_gist
ON osm.osm_buildings USING GIST (geometry);

-- Index on OSM ID for lookups
CREATE INDEX IF NOT EXISTS idx_osm_buildings_osm_id
ON osm.osm_buildings (osm_id);

-- Partial index for non-null geometries
CREATE INDEX IF NOT EXISTS idx_osm_buildings_geometry_not_null
ON osm.osm_buildings USING GIST (geometry)
WHERE geometry IS NOT NULL;

-- Index on building type (useful for filtering)
CREATE INDEX IF NOT EXISTS idx_osm_buildings_building
ON osm.osm_buildings (building);

-- ============================================================================
-- Analyze tables
-- ============================================================================

ANALYZE osm.osm_buildings;
VACUUM ANALYZE osm.osm_buildings;

-- ============================================================================
-- Check indexes
-- ============================================================================

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'osm' AND tablename = 'osm_buildings'
ORDER BY indexname;

-- ============================================================================
-- Performance Notes
-- ============================================================================

/*
These indexes on the actual table in osmbe will be used by PostgreSQL
when querying through the foreign table (osm_remote.osm_buildings) in be2osm.

The PostgreSQL query planner is smart enough to push down spatial predicates
(like ST_Intersects, ST_DWithin) to the remote server, so these indexes
will significantly improve performance even when querying through the FDW.

Expected improvements:
- ST_Intersects: 1000x faster (ms instead of seconds)
- ST_DWithin: 100x faster with spatial index
- Overall query: Should complete in 1-3 seconds for typical viewport
*/
