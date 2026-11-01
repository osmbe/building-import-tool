-- migrate:no-transaction
-- migrate:heavy
-- GRB address summary, step 4: one main-address string per polygon, summarized house numbers and the number of
-- flats/units for `building:flats` (issues #130, #135 and #136).
--
-- Address points are still matched to polygons by spatial containment (ST_Contains, docs/GRB_ADDRESS_JOIN.md).
-- A row in grb.addresses is a main address when box_number is empty and a subaddress ("bus") when it is not.
-- Subaddresses stay in the table, but are excluded from the address value and the house-number summary. They do
-- count towards `flats`, as do main addresses without any subaddress.
--
-- This file is the single source of truth for the view definition. It is heavy because, on a database that has
-- the old view, the new one is built next to it as buildings_with_addresses_v3 (about 30 minutes on the full
-- dataset) while tiles and the API keep reading the old one. The two are then swapped in one short transaction.
-- A re-run after a failure reuses a v3 that was already built and recreates a missing candidates view.
-- On a fresh database (no view yet) the view is created directly; on empty tables that is instant.

-- Summarize main house numbers as an odd/even series: 1,3,5 -> 1-5; 1,3 -> 1,3. Letter variants stay separate
-- and split a range; values that are not a number (12/3, an official 1-3 label) are kept verbatim at the end.
-- Built-in types only: the function body is dumped as text, so it must not name a schema-local type.
CREATE OR REPLACE FUNCTION grb.summarize_house_numbers(numbers TEXT[])
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
    tokens JSONB := '[]'::jsonb;
    bases BIGINT[] := '{}';
    opaque TEXT[] := '{}';
    result TEXT[] := '{}';
    run BIGINT[] := '{}';
    segment BIGINT[] := '{}';
    parts TEXT[];
    input TEXT;
    v_suffix TEXT;
    v_base BIGINT;
    base_count INTEGER;
    i INTEGER;
    j INTEGER;
    has_variants BOOLEAN;
    mixed_parity BOOLEAN;
BEGIN
    IF numbers IS NULL THEN
        RETURN NULL;
    END IF;

    FOREACH input IN ARRAY numbers LOOP
        input := btrim(input);
        CONTINUE WHEN input IS NULL OR input = '';
        input := regexp_replace(input, '\s+', '', 'g');
        CONTINUE WHEN input = '';

        IF input ~ '^[0-9]+$' THEN
            v_base := COALESCE(NULLIF(ltrim(input, '0'), ''), '0')::bigint;
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                WHERE (t->>'kind')::int = 0 AND (t->>'base')::bigint = v_base) THEN
                tokens := tokens || jsonb_build_object(
                    'kind', 0, 'base', v_base, 'suffix', '', 'value', v_base::text);
            END IF;
        ELSIF input ~ '^[0-9]+[A-Za-z]+$' THEN
            parts := regexp_match(input, '^([0-9]+)([A-Za-z]+)$');
            v_base := COALESCE(NULLIF(ltrim(parts[1], '0'), ''), '0')::bigint;
            v_suffix := upper(parts[2]);
            IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = v_base AND t->>'suffix' = v_suffix) THEN
                tokens := tokens || jsonb_build_object(
                    'kind', 1, 'base', v_base, 'suffix', v_suffix, 'value', v_base::text || v_suffix);
            END IF;
        ELSE
            IF NOT (input = ANY(opaque)) THEN
                opaque := array_append(opaque, input);
            END IF;
        END IF;
    END LOOP;

    SELECT array_agg(DISTINCT (t->>'base')::bigint ORDER BY (t->>'base')::bigint) INTO bases
    FROM jsonb_array_elements(tokens) t
    WHERE (t->>'kind')::int IN (0, 1);
    base_count := COALESCE(cardinality(bases), 0);

    IF base_count = 0 THEN
        result := ARRAY(SELECT DISTINCT o FROM unnest(opaque) o ORDER BY o);
        RETURN array_to_string(result, ',');
    END IF;

    mixed_parity :=
        EXISTS (SELECT 1 FROM unnest(bases) b WHERE b % 2 = 1)
        AND EXISTS (SELECT 1 FROM unnest(bases) b WHERE b % 2 = 0);

    IF mixed_parity THEN
        -- Mixed odd/even addresses: ranges would be misleading, so list every value.
        FOREACH v_base IN ARRAY bases LOOP
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                WHERE (t->>'kind')::int = 0 AND (t->>'base')::bigint = v_base) THEN
                result := array_append(result, v_base::text);
            END IF;
            FOR v_suffix IN
                SELECT t->>'suffix' FROM jsonb_array_elements(tokens) t
                WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = v_base
                ORDER BY t->>'suffix'
            LOOP
                result := array_append(result, v_base::text || v_suffix);
            END LOOP;
        END LOOP;
    ELSE
        i := 1;
        WHILE i <= base_count LOOP
            run := ARRAY[bases[i]];
            j := i + 1;
            WHILE j <= base_count AND bases[j] = bases[j - 1] + 2 LOOP
                run := array_append(run, bases[j]);
                j := j + 1;
            END LOOP;

            has_variants := EXISTS (
                SELECT 1 FROM jsonb_array_elements(tokens) t
                WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = ANY(run)
            );

            IF cardinality(run) >= 3 OR (base_count > 2 AND cardinality(run) >= 2) THEN
                IF NOT has_variants THEN
                    result := array_append(result, run[1]::text || '-' || run[cardinality(run)]::text);
                ELSE
                    -- A base with letter variants splits the run: flush the plain bases before it, write the
                    -- variants next, then start a new run after it.
                    segment := '{}';
                    FOREACH v_base IN ARRAY run LOOP
                        IF EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                            WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = v_base) THEN
                            IF cardinality(segment) >= 2 THEN
                                result := array_append(result,
                                    segment[1]::text || '-' || segment[cardinality(segment)]::text);
                            ELSIF cardinality(segment) = 1 THEN
                                result := array_append(result, segment[1]::text);
                            END IF;
                            segment := '{}';

                            IF EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                                WHERE (t->>'kind')::int = 0 AND (t->>'base')::bigint = v_base) THEN
                                result := array_append(result, v_base::text);
                            END IF;
                            FOR v_suffix IN
                                SELECT t->>'suffix' FROM jsonb_array_elements(tokens) t
                                WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = v_base
                                ORDER BY t->>'suffix'
                            LOOP
                                result := array_append(result, v_base::text || v_suffix);
                            END LOOP;
                        ELSE
                            segment := array_append(segment, v_base);
                        END IF;
                    END LOOP;

                    IF cardinality(segment) >= 2 THEN
                        result := array_append(result,
                            segment[1]::text || '-' || segment[cardinality(segment)]::text);
                    ELSIF cardinality(segment) = 1 THEN
                        result := array_append(result, segment[1]::text);
                    END IF;
                END IF;
            ELSE
                FOREACH v_base IN ARRAY run LOOP
                    IF EXISTS (SELECT 1 FROM jsonb_array_elements(tokens) t
                        WHERE (t->>'kind')::int = 0 AND (t->>'base')::bigint = v_base) THEN
                        result := array_append(result, v_base::text);
                    END IF;
                    FOR v_suffix IN
                        SELECT t->>'suffix' FROM jsonb_array_elements(tokens) t
                        WHERE (t->>'kind')::int = 1 AND (t->>'base')::bigint = v_base
                        ORDER BY t->>'suffix'
                    LOOP
                        result := array_append(result, v_base::text || v_suffix);
                    END LOOP;
                END LOOP;
            END IF;

            i := j;
        END LOOP;
    END IF;

    -- Opaque values (12/3, official 1-3 labels) never join a range.
    FOR input IN SELECT DISTINCT o FROM unnest(opaque) o ORDER BY o LOOP
        result := array_append(result, input);
    END LOOP;

    RETURN array_to_string(result, ',');
END $$;

DO $$
DECLARE
    current_ok BOOLEAN := EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = to_regclass('grb.buildings_with_addresses')
          AND attname = 'house_numbers' AND NOT attisdropped
    );
    target TEXT;
BEGIN
    IF current_ok THEN
        -- A previous run (or a new database) already has the new view; only candidates may be missing.
        IF to_regclass('grb.candidates') IS NULL THEN
            RAISE WARNING 'grb/008: grb.candidates is missing; the view is recreated below';
        END IF;
        RETURN;
    END IF;
    target := CASE WHEN to_regclass('grb.buildings_with_addresses') IS NULL
        THEN 'buildings_with_addresses' ELSE 'buildings_with_addresses_v3' END;
    IF to_regclass('grb.' || target) IS NOT NULL THEN
        RETURN; -- v3 left by an interrupted run: CREATE MATERIALIZED VIEW is atomic, so it is complete
    END IF;
    EXECUTE format($view$CREATE MATERIALIZED VIEW grb.%I AS
    WITH main_addresses AS (
        SELECT
            bp.id AS polygon_id,
            btrim(a.street_name) AS street_name,
            COALESCE(
                NULLIF(btrim(a.house_number), ''),
                NULLIF(btrim(substr(a.full_address, length(btrim(a.street_name)) + 1)), '')
            ) AS house_number,
            a.postcode,
            a.municipality
        FROM grb.building_polygons bp
        JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
        WHERE (a.box_number IS NULL OR btrim(a.box_number) = '')
          AND a.street_name IS NOT NULL
          AND btrim(a.street_name) <> ''
    ),
    main AS (
        SELECT DISTINCT polygon_id, street_name, house_number
        FROM main_addresses
        WHERE house_number IS NOT NULL AND btrim(house_number) <> ''
    ),
    sub_addresses AS (
        SELECT DISTINCT
            bp.id AS polygon_id,
            btrim(a.street_name) AS street_name,
            COALESCE(
                NULLIF(btrim(a.house_number), ''),
                NULLIF(btrim(substr(a.full_address, length(btrim(a.street_name)) + 1)), '')
            ) AS house_number,
            btrim(a.box_number) AS box_number
        FROM grb.building_polygons bp
        JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
        WHERE a.box_number IS NOT NULL
          AND btrim(a.box_number) <> ''
    ),
    addr_per_polygon AS (
        SELECT
            m.polygon_id,
            COUNT(*) AS main_count,
            COUNT(DISTINCT m.street_name) AS street_count,
            MIN(m.street_name) AS street_name,
            grb.summarize_house_numbers(array_agg(DISTINCT m.house_number)) AS house_numbers,
            COUNT(DISTINCT m.house_number) AS address_count
        FROM main m
        GROUP BY m.polygon_id
    ),
    postal_per_polygon AS (
        SELECT
            polygon_id,
            array_to_string(ARRAY_AGG(DISTINCT postcode ORDER BY postcode)
                FILTER (WHERE postcode IS NOT NULL), ', ') AS postcodes,
            array_to_string(ARRAY_AGG(DISTINCT municipality ORDER BY municipality)
                FILTER (WHERE municipality IS NOT NULL), ', ') AS municipalities
        FROM main_addresses
        GROUP BY polygon_id
    ),
    subs_per_polygon AS (
        SELECT polygon_id, COUNT(*) AS sub_count
        FROM sub_addresses
        GROUP BY polygon_id
    ),
    main_with_subs AS (
        SELECT m.polygon_id, COUNT(*) AS main_with_sub_count
        FROM main m
        WHERE EXISTS (
            SELECT 1 FROM sub_addresses s
            WHERE s.polygon_id = m.polygon_id
              AND s.street_name = m.street_name
              AND s.house_number = m.house_number
        )
        GROUP BY m.polygon_id
    )
    SELECT
        -- Unique per polygon (OIDNs are only unique per entity); used as the vector tile feature id
        bp.id AS polygon_id,
        -- Polygon-level info (for OSM tagging: source:geometry:ref = <entity>/<oidn>)
        -- Cast oidn to BIGINT for Martin tile server (source is numeric(15,0))
        bp.entity,
        bp.oidn::BIGINT AS oidn,
        bp.gebouw_id,
        bp.area_m2::REAL AS polygon_area_m2,
        bp.type_label AS polygon_type_label,

        -- Survey date for source:geometry:date OSM tag (format: YYYY-MM-DD)
        TO_CHAR(bp.survey_date, 'YYYY-MM-DD') AS survey_date,

        -- Origin/inventory label (e.g. "terreinbezoek", "as-built plan")
        bp.origin_label,

        -- Transform to Web Mercator for tile serving (transform once at view creation, not per tile)
        -- Explicit cast so PostGIS registers SRID=3857 in geometry_columns (required by Martin)
        ST_Transform(bp.geom, 3857)::geometry(Geometry, 3857) AS geom,

        -- Parent building aggregated stats (for context)
        b.polygon_count,
        b.total_area_m2,
        b.type_label AS building_type_label,

        -- One street: the summarized main-address value. Several streets: no address value at all.
        CASE WHEN COALESCE(app.street_count, 0) = 1 AND app.house_numbers IS NOT NULL
            THEN app.street_name || ' ' || app.house_numbers ELSE '' END AS addresses,
        CASE WHEN COALESCE(app.street_count, 0) = 1 THEN app.street_name ELSE '' END AS street_names,
        COALESCE(post.postcodes, '') AS postcodes,
        COALESCE(post.municipalities, '') AS municipalities,
        CASE WHEN COALESCE(app.street_count, 0) = 1 THEN app.address_count ELSE 0 END AS address_count,

        -- Internal columns for details and building:flats; not part of the candidates contract.
        CASE WHEN COALESCE(app.street_count, 0) = 1 THEN app.street_name ELSE '' END AS street_name,
        CASE WHEN COALESCE(app.street_count, 0) = 1 THEN app.house_numbers ELSE '' END AS house_numbers,
        COALESCE(subs.sub_count, 0) + (COALESCE(app.main_count, 0) - COALESCE(with_subs.main_with_sub_count, 0))
            AS flats
    FROM
        grb.building_polygons bp
        LEFT JOIN grb.buildings b ON bp.gebouw_id = b.gebouw_id
        LEFT JOIN addr_per_polygon app ON bp.id = app.polygon_id
        LEFT JOIN postal_per_polygon post ON bp.id = post.polygon_id
        LEFT JOIN subs_per_polygon subs ON bp.id = subs.polygon_id
        LEFT JOIN main_with_subs with_subs ON bp.id = with_subs.polygon_id$view$, target);
END $$;

-- Indexes on the view being built (v3 when it exists), named like the final ones plus _v3
SELECT CASE WHEN to_regclass('grb.buildings_with_addresses_v3') IS NULL THEN '' ELSE '_v3' END AS sfx,
       CASE WHEN to_regclass('grb.buildings_with_addresses_v3') IS NULL THEN 'buildings_with_addresses'
            ELSE 'buildings_with_addresses_v3' END AS mv \gset

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_id:sfx ON grb.:mv (polygon_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_entity_oidn:sfx ON grb.:mv (entity, oidn);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_gebouw_id:sfx ON grb.:mv (gebouw_id);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_polygon_type:sfx ON grb.:mv (polygon_type_label);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_geom:sfx ON grb.:mv USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_mv_buildings_with_addresses_postcodes:sfx ON grb.:mv USING GIN (postcodes);

-- Swap: drop the old view and give v3 (and its indexes) the final names, then recreate the candidates view that
-- the DROP ... CASCADE takes with it, in one transaction. It waits at most lock_timeout for running tile queries;
-- the migration runner retries on a lock timeout.
BEGIN;
DO $$
DECLARE
    idx TEXT;
BEGIN
    IF to_regclass('grb.buildings_with_addresses_v3') IS NULL THEN
        RETURN;
    END IF;
    DROP MATERIALIZED VIEW IF EXISTS grb.buildings_with_addresses CASCADE;
    ALTER MATERIALIZED VIEW grb.buildings_with_addresses_v3 RENAME TO buildings_with_addresses;
    FOREACH idx IN ARRAY ARRAY['polygon_id', 'entity_oidn', 'gebouw_id', 'polygon_type', 'geom', 'postcodes'] LOOP
        EXECUTE format('ALTER INDEX grb.%I RENAME TO %I',
            'idx_mv_buildings_with_addresses_' || idx || '_v3', 'idx_mv_buildings_with_addresses_' || idx);
    END LOOP;
    RAISE WARNING 'grb/008: grb.buildings_with_addresses rebuilt with summarized addresses and flats';
END $$;
COMMIT;

CREATE OR REPLACE VIEW grb.candidates AS
SELECT
    bwa.polygon_id::bigint AS fid,
    'grb'::text AS source,
    bwa.entity::text AS entity,
    bwa.oidn::text AS source_id,
    (bwa.entity || '/' || bwa.oidn)::text AS source_ref,
    NULL::text AS type_code,
    bwa.polygon_type_label::text AS type_label,
    bwa.survey_date::text AS survey_date,
    bwa.origin_label::text AS origin_label,
    bwa.polygon_area_m2::real AS area_m2,
    bwa.gebouw_id::text AS parent_id,
    bwa.building_type_label::text AS parent_type_label,
    bwa.polygon_count::integer AS parent_part_count,
    bwa.total_area_m2::real AS parent_area_m2,
    bwa.addresses::text AS addresses,
    bwa.street_names::text AS street_names,
    bwa.postcodes::text AS postcodes,
    bwa.municipalities::text AS municipalities,
    bwa.address_count::integer AS address_count,
    jsonb_strip_nulls(jsonb_build_object(
        'street', NULLIF(bwa.street_name, ''),
        'house_numbers', NULLIF(bwa.house_numbers, ''),
        'flats', CASE WHEN bwa.flats > 1 THEN bwa.flats END
    )) AS details,
    bwa.geom
FROM grb.buildings_with_addresses bwa;
