-- PICC (Wallonia) Database Schema Setup
-- Buildings from INSPIRE WFS + Addresses from ICAR shapefile
-- Run this on the be2osm database

\c be2osm

\echo '======================================'
\echo 'PICC (Wallonia) Schema Setup'
\echo '======================================'
\echo ''

-- Create schema for PICC data
CREATE SCHEMA IF NOT EXISTS picc;

\echo '✓ PICC schema created'

-- Building Polygons (from INSPIRE Buildings WFS)
-- ~1.5M building footprints from Wallonia
CREATE TABLE IF NOT EXISTS picc.building_polygons (
    id BIGSERIAL PRIMARY KEY,

    -- INSPIRE identifiers
    inspire_id VARCHAR(128) UNIQUE NOT NULL,  -- inspireid_localid from WFS
    object_id BIGINT,                         -- objectid from WFS

    -- Building characteristics
    building_nature VARCHAR(64),              -- buildingnature
    current_use VARCHAR(64),                  -- currentuse
    construction_date VARCHAR(32),            -- dateofconstruction (string, format varies)
    condition VARCHAR(64),                    -- conditionofconstruction

    -- Measurements
    height_m REAL,                            -- heightaboveground
    num_dwellings INTEGER,                    -- numberofdwellings
    num_floors INTEGER,                       -- numberoffloorsaboveground

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Polygon, 4326) NOT NULL,

    -- Web Mercator for tile serving (EPSG:3857)
    geom_mercator GEOMETRY(Polygon, 3857),

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Addresses (from ICAR shapefile)
-- ~1.4M address points with full address information
CREATE TABLE IF NOT EXISTS picc.addresses (
    id BIGSERIAL PRIMARY KEY,

    -- ICAR identifier
    icar_id BIGINT UNIQUE NOT NULL,           -- ID from shapefile

    -- Street information
    street_name VARCHAR(128),                 -- rue
    house_number VARCHAR(16),                 -- numero
    box_number VARCHAR(16),                   -- boite

    -- Location
    postcode VARCHAR(8),                      -- code_posta
    municipality VARCHAR(64),                 -- commune
    nis_code VARCHAR(8),                      -- ins (INS/NIS code)

    -- Full address
    full_address VARCHAR(255),                -- adresse

    -- Geometry (WGS84 - EPSG:4326)
    geom GEOMETRY(Point, 4326) NOT NULL,

    -- Web Mercator for tile serving (EPSG:3857)
    geom_mercator GEOMETRY(Point, 3857),

    -- Import tracking
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

\echo '✓ Tables created'

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Building polygon indexes
CREATE INDEX IF NOT EXISTS idx_picc_buildings_inspire_id ON picc.building_polygons(inspire_id);
CREATE INDEX IF NOT EXISTS idx_picc_buildings_geom ON picc.building_polygons USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_picc_buildings_geom_mercator ON picc.building_polygons USING GIST(geom_mercator);

-- Address indexes
CREATE INDEX IF NOT EXISTS idx_picc_addresses_icar_id ON picc.addresses(icar_id);
CREATE INDEX IF NOT EXISTS idx_picc_addresses_geom ON picc.addresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_picc_addresses_geom_mercator ON picc.addresses USING GIST(geom_mercator);
CREATE INDEX IF NOT EXISTS idx_picc_addresses_postcode ON picc.addresses(postcode);
CREATE INDEX IF NOT EXISTS idx_picc_addresses_municipality ON picc.addresses(municipality);

\echo '✓ Indexes created'

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to auto-generate Web Mercator geometry
CREATE OR REPLACE FUNCTION picc.update_mercator_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.geom IS NOT NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for building polygons
DROP TRIGGER IF EXISTS trg_picc_buildings_mercator ON picc.building_polygons;
CREATE TRIGGER trg_picc_buildings_mercator
    BEFORE INSERT OR UPDATE ON picc.building_polygons
    FOR EACH ROW EXECUTE FUNCTION picc.update_mercator_geom();

-- Trigger for addresses
DROP TRIGGER IF EXISTS trg_picc_addresses_mercator ON picc.addresses;
CREATE TRIGGER trg_picc_addresses_mercator
    BEFORE INSERT OR UPDATE ON picc.addresses
    FOR EACH ROW EXECUTE FUNCTION picc.update_mercator_geom();

\echo '✓ Triggers created'

\echo ''
\echo '======================================'
\echo 'PICC Schema Setup Complete'
\echo '======================================'
\echo ''
\echo 'Next steps:'
\echo '  1. Download ICAR addresses: just picc-download-addresses'
\echo '  2. Import data: just picc-import'
\echo ''
