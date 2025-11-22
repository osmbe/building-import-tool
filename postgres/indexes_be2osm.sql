-- Performance indexes for be2osm database
-- Run this on: be2osm database

-- ============================================================================
-- GRB Buildings Indexes (local tables in be2osm)
-- ============================================================================

-- Spatial index on geometry (most important!)
CREATE INDEX IF NOT EXISTS idx_grb_buildings_geom_gist
ON grb.buildings USING GIST (geom);

-- Index on primary key for joins
CREATE INDEX IF NOT EXISTS idx_grb_buildings_ogc_fid
ON grb.buildings (ogc_fid);

-- Index on building type for filtering
CREATE INDEX IF NOT EXISTS idx_grb_buildings_lbltype
ON grb.buildings (lbltype);

-- Partial index for non-null geometries (since we filter on this)
CREATE INDEX IF NOT EXISTS idx_grb_buildings_geom_not_null
ON grb.buildings USING GIST (geom)
WHERE geom IS NOT NULL;

-- ============================================================================
-- Analyze tables
-- ============================================================================

ANALYZE grb.buildings;
VACUUM ANALYZE grb.buildings;

-- ============================================================================
-- Check indexes
-- ============================================================================

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'grb' AND tablename = 'buildings'
ORDER BY indexname;
