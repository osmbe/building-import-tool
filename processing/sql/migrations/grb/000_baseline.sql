-- GRB baseline: the tables, indexes, foreign keys, triggers and views that postgres/02-setup-be2osm.sql used to
-- create on a fresh volume. Owning them here means every database gets them the same way (fresh volume, CI
-- import, test database) and a schema change is always a new migration.
--
-- On a database that already has them (production, created by the old init script) this changes nothing:
-- tables and indexes are IF NOT EXISTS, foreign keys and triggers are added only when missing, and the
-- comments are only set on a fresh schema (some describe columns that later migrations add, e.g. entity).
-- Later migrations take it from there (001: entity, 002: unique (entity, oidn), 003: the materialized view).

SELECT to_regclass('grb.building_polygons') IS NULL AS grb_fresh \gset

CREATE TABLE IF NOT EXISTS grb.import_meta (
    imported_at TIMESTAMPTZ NOT NULL
);

-- Building polygons (GBG gebouwen + GBA gebouwaanhorigheden), 5M+ rows
CREATE TABLE IF NOT EXISTS grb.building_polygons (
    id BIGSERIAL PRIMARY KEY,
    entity VARCHAR(3) NOT NULL DEFAULT 'Gbg', -- 'Gbg' (gebouw) or 'Gba' (gebouwaanhorigheid)
    oidn BIGINT NOT NULL,                     -- unique per entity (002)
    uidn BIGINT,
    gebouw_id BIGINT,                         -- logical building (RltGbgGebouw)
    type_code INTEGER,
    type_label VARCHAR(64),                   -- LBLTYPE
    area_m2 REAL,                             -- OPPERVL
    length_m REAL,                            -- LENGTE
    version INTEGER,
    begin_date DATE,
    version_date DATE,
    survey_date DATE,                         -- OPNDATUM
    origin_code INTEGER,                      -- BGNINV
    origin_label VARCHAR(32),                 -- LBLBGNINV
    opndatum_raw VARCHAR(10),
    geom GEOMETRY(Polygon, 4326) NOT NULL,
    geom_mercator GEOMETRY(Polygon, 3857),
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kunstwerken (KNW structures)
CREATE TABLE IF NOT EXISTS grb.kunstwerken (
    id BIGSERIAL PRIMARY KEY,
    oidn BIGINT UNIQUE NOT NULL,
    uidn BIGINT,
    type_code INTEGER,
    type_label VARCHAR(96),
    area_m2 REAL,
    length_m REAL,
    version INTEGER,
    survey_date DATE,
    origin_code INTEGER,
    origin_label VARCHAR(64),
    opndatum_raw VARCHAR(10),
    entity VARCHAR(8) DEFAULT 'Knw',
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    geom_mercator GEOMETRY(Geometry, 3857),
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logical buildings, aggregated from building_polygons
CREATE TABLE IF NOT EXISTS grb.buildings (
    gebouw_id BIGINT PRIMARY KEY,
    polygon_count INTEGER,
    total_area_m2 REAL,
    type_label VARCHAR(64),
    geom GEOMETRY(MultiPolygon, 4326),
    geom_mercator GEOMETRY(MultiPolygon, 3857),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GRAR address points, 1.3M+ rows
CREATE TABLE IF NOT EXISTS grb.addresses (
    id BIGSERIAL PRIMARY KEY,
    oidn BIGINT UNIQUE NOT NULL,
    adres_id BIGINT UNIQUE NOT NULL,
    id_string VARCHAR(128),
    street_id BIGINT,
    street_name VARCHAR(80),
    house_number VARCHAR(11),
    box_number VARCHAR(10),
    postcode VARCHAR(4),
    nis_code VARCHAR(5),
    municipality VARCHAR(40),
    full_address VARCHAR(254),
    position_spec_code INTEGER,
    position_spec VARCHAR(32),
    method_code INTEGER,
    method VARCHAR(32),
    status_code INTEGER,
    status VARCHAR(32),
    official_assignment_code INTEGER,
    official_assignment VARCHAR(32),
    origin_code INTEGER,
    origin_label VARCHAR(32),
    version_id VARCHAR(32),
    version INTEGER,
    begin_date DATE,
    version_date DATE,
    geom GEOMETRY(Point, 4326) NOT NULL,
    geom_mercator GEOMETRY(Point, 3857),
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Address to building links (AdresGebouweenheidKoppelingen)
CREATE TABLE IF NOT EXISTS grb.address_building_links (
    id BIGSERIAL PRIMARY KEY,
    adres_id BIGINT NOT NULL,
    building_object_id VARCHAR(30),
    object_type VARCHAR(20),
    imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Polygon to building relation (RltGbgGebouw). No unique oidn: the DBF can repeat one.
CREATE TABLE IF NOT EXISTS grb.polygon_building_rel (
    ogc_fid SERIAL PRIMARY KEY,
    oidn BIGINT NOT NULL,
    gebouw_id BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS grb.import_statistics (
    id SERIAL PRIMARY KEY,
    import_date TIMESTAMPTZ DEFAULT NOW(),
    source_file VARCHAR(255),
    buildings_count INTEGER,
    processing_time_seconds INTEGER,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_building_polygons_oidn ON grb.building_polygons(oidn);
CREATE INDEX IF NOT EXISTS idx_building_polygons_gebouw_id ON grb.building_polygons(gebouw_id) WHERE gebouw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_code ON grb.building_polygons(type_code);
CREATE INDEX IF NOT EXISTS idx_building_polygons_type_label ON grb.building_polygons(type_label);
CREATE INDEX IF NOT EXISTS idx_building_polygons_imported ON grb.building_polygons(imported_at);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom ON grb.building_polygons USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_building_polygons_geom_mercator ON grb.building_polygons USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kunstwerken_oidn ON grb.kunstwerken(oidn);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_type_code ON grb.kunstwerken(type_code);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_type_label ON grb.kunstwerken(type_label);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_survey_date ON grb.kunstwerken(survey_date);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_entity ON grb.kunstwerken(entity);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_imported ON grb.kunstwerken(imported_at);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_geom ON grb.kunstwerken USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_kunstwerken_geom_mercator ON grb.kunstwerken USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_buildings_type_label ON grb.buildings(type_label);
CREATE INDEX IF NOT EXISTS idx_buildings_polygon_count ON grb.buildings(polygon_count);
CREATE INDEX IF NOT EXISTS idx_buildings_total_area ON grb.buildings(total_area_m2);
CREATE INDEX IF NOT EXISTS idx_buildings_geom ON grb.buildings USING GIST(geom) WHERE geom IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_buildings_geom_mercator ON grb.buildings USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_addresses_oidn ON grb.addresses(oidn);
CREATE INDEX IF NOT EXISTS idx_addresses_adres_id ON grb.addresses(adres_id);
CREATE INDEX IF NOT EXISTS idx_addresses_street_name ON grb.addresses(street_name);
CREATE INDEX IF NOT EXISTS idx_addresses_postcode ON grb.addresses(postcode);
CREATE INDEX IF NOT EXISTS idx_addresses_municipality ON grb.addresses(municipality);
CREATE INDEX IF NOT EXISTS idx_addresses_full_address ON grb.addresses(full_address);
CREATE INDEX IF NOT EXISTS idx_addresses_house_number ON grb.addresses(house_number);
CREATE INDEX IF NOT EXISTS idx_addresses_geom ON grb.addresses USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_addresses_geom_mercator ON grb.addresses USING GIST(geom_mercator) WHERE geom_mercator IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_address_building_links_adres_id ON grb.address_building_links(adres_id);
CREATE INDEX IF NOT EXISTS idx_address_building_links_building_object_id ON grb.address_building_links(building_object_id);
CREATE INDEX IF NOT EXISTS idx_address_building_links_object_type ON grb.address_building_links(object_type);
-- For the BIGINT join of the materialized view
CREATE INDEX IF NOT EXISTS idx_abl_building_obj_bigint ON grb.address_building_links ((building_object_id::bigint));

CREATE INDEX IF NOT EXISTS idx_polygon_building_rel_oidn ON grb.polygon_building_rel(oidn);
CREATE INDEX IF NOT EXISTS idx_polygon_building_rel_gebouw_id ON grb.polygon_building_rel(gebouw_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_building_polygons_gebouw_id'
                   AND conrelid = 'grb.building_polygons'::regclass) THEN
        ALTER TABLE grb.building_polygons ADD CONSTRAINT fk_building_polygons_gebouw_id
            FOREIGN KEY (gebouw_id) REFERENCES grb.buildings(gebouw_id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_address_building_links_adres_id'
                   AND conrelid = 'grb.address_building_links'::regclass) THEN
        ALTER TABLE grb.address_building_links ADD CONSTRAINT fk_address_building_links_adres_id
            FOREIGN KEY (adres_id) REFERENCES grb.addresses(adres_id) ON DELETE CASCADE;
    END IF;
END $$;

-- Triggers: updated_at, and the Web Mercator geometry when it is missing. The functions are in public, so the
-- triggers of a schema restored as grb_next (CI dump) find them too.
CREATE OR REPLACE FUNCTION public.update_building_polygon()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_kunstwerk_polygon()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;
    IF NEW.entity IS NULL OR NEW.entity = '' THEN
        NEW.entity = 'Knw';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_address()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_building()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.geom IS NOT NULL AND NEW.geom_mercator IS NULL THEN
        NEW.geom_mercator = ST_Transform(NEW.geom, 3857);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT * FROM (VALUES
        ('building_polygons_before_update', 'grb.building_polygons', 'public.update_building_polygon'),
        ('kunstwerken_before_update', 'grb.kunstwerken', 'public.update_kunstwerk_polygon'),
        ('addresses_before_update', 'grb.addresses', 'public.update_address'),
        ('buildings_before_update', 'grb.buildings', 'public.update_building')
    ) AS v(name, tbl, fn) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t.name AND tgrelid = t.tbl::regclass) THEN
            EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION %s()',
                t.name, t.tbl, t.fn);
        END IF;
    END LOOP;
END $$;

CREATE OR REPLACE VIEW grb.building_polygons_summary AS
SELECT
    type_label,
    COUNT(*) as polygon_count,
    COUNT(DISTINCT gebouw_id) as building_count,
    ROUND(AVG(area_m2)::numeric, 2) as avg_area_m2,
    ROUND(SUM(area_m2)::numeric, 2) as total_area_m2
FROM grb.building_polygons
WHERE gebouw_id IS NOT NULL
GROUP BY type_label
ORDER BY polygon_count DESC;

CREATE OR REPLACE VIEW grb.addresses_summary AS
SELECT
    municipality,
    postcode,
    COUNT(*) as address_count,
    COUNT(DISTINCT street_name) as street_count
FROM grb.addresses
GROUP BY municipality, postcode
ORDER BY municipality, postcode;

\if :grb_fresh
COMMENT ON TABLE grb.building_polygons IS 'GRB building polygons (GBG + GBA) - 5M+ individual polygon geometries';
COMMENT ON COLUMN grb.building_polygons.oidn IS 'Polygon identifier from GRB, unique per entity';
COMMENT ON COLUMN grb.building_polygons.entity IS 'GRB entity: Gbg (gebouw) or Gba (gebouwaanhorigheid)';
COMMENT ON COLUMN grb.building_polygons.gebouw_id IS 'Building ID - one building can have multiple polygons';
COMMENT ON COLUMN grb.building_polygons.geom IS 'Geometry in WGS84 (EPSG:4326)';
COMMENT ON TABLE grb.kunstwerken IS 'GRB kunstwerken geometries (KNW) - non-building structures for OSM import support';
COMMENT ON COLUMN grb.kunstwerken.oidn IS 'Unique kunstwerk identifier from GRB';
COMMENT ON COLUMN grb.kunstwerken.type_label IS 'Kunstwerk type label (LBLTYPE)';
COMMENT ON COLUMN grb.kunstwerken.entity IS 'Source geometry entity identifier (Knw)';
COMMENT ON COLUMN grb.kunstwerken.geom IS 'Geometry in WGS84 (EPSG:4326)';
COMMENT ON TABLE grb.buildings IS 'GRB buildings (aggregated) - logical buildings with multiple polygons unified';
COMMENT ON COLUMN grb.buildings.gebouw_id IS 'Building ID from RltGbgGebouw relationship table';
COMMENT ON COLUMN grb.buildings.geom IS 'MultiPolygon geometry (union of all building polygons)';
COMMENT ON TABLE grb.addresses IS 'GRAR address points - 1.3M+ addresses with full metadata';
COMMENT ON COLUMN grb.addresses.adres_id IS 'Unique address identifier from GRAR';
COMMENT ON COLUMN grb.addresses.full_address IS 'Complete formatted address string';
COMMENT ON COLUMN grb.addresses.geom IS 'Point geometry in WGS84 (EPSG:4326)';
COMMENT ON TABLE grb.address_building_links IS 'Links between addresses and building objects - 3.9M+ links';
COMMENT ON COLUMN grb.address_building_links.adres_id IS 'Address ID (foreign key to addresses.adres_id)';
COMMENT ON COLUMN grb.address_building_links.building_object_id IS 'Building ID (GEBOUWID) — links to buildings.gebouw_id and building_polygons.gebouw_id';
\endif
