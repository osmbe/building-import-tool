CREATE OR REPLACE FUNCTION picc.load_raw(raw_buildings regclass, raw_addresses regclass, replace boolean DEFAULT false)
RETURNS TABLE (buildings bigint, addresses bigint)
LANGUAGE plpgsql AS $fn$
DECLARE
    has_col CONSTANT TEXT := 'SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = $1 AND attname = $2 AND NOT attisdropped)';
    found BOOLEAN;
    nb BIGINT := 0;
    na BIGINT := 0;
    street TEXT;
    num TEXT;
    postcode TEXT;
    municipality TEXT;
    objectid_expr TEXT := 'NULL::bigint';
BEGIN
    IF raw_buildings IS NOT NULL THEN
        IF replace THEN
            EXECUTE format('DELETE FROM picc.buildings WHERE objectid IN (SELECT objectid::bigint FROM %s)', raw_buildings);
        END IF;
        -- A row's position among the buildings with its objectid (already stored ones first), stable for
        -- the same data
        EXECUTE format($q$
            INSERT INTO picc.buildings (fid, objectid, georef_id, natur_code, natur_desc, date_leve, date_modif, geom)
            SELECT r.objectid + 10000000000 * (coalesce(e.n, 0) + row_number() OVER (
                       PARTITION BY r.objectid ORDER BY r.georef_id, md5(ST_AsBinary(r.geom))) - 1),
                   r.objectid, r.georef_id, r.natur_code, r.natur_desc, r.date_leve, r.date_modif, r.geom
            FROM (
                SELECT objectid::bigint AS objectid, georef_id::text, natur_code::text, natur_desc::text,
                    CASE WHEN date_leve::text  ~ '^[0-9]{14}$' THEN to_date(left(date_leve::text, 8),  'YYYYMMDD')
                            ELSE date_leve::date
                        END AS date_leve,
                    CASE WHEN date_modif::text ~ '^[0-9]{14}$' THEN to_date(left(date_modif::text, 8), 'YYYYMMDD')
                            ELSE date_modif::date
                        END AS date_modif,
                    ST_Multi(ST_CollectionExtract(ST_Force2D(ST_SetSRID(geom, 31370)), 3)) AS geom
                FROM %s
                WHERE geom IS NOT NULL
            ) r
            LEFT JOIN (SELECT objectid, count(*) AS n FROM picc.buildings GROUP BY objectid) e USING (objectid)
            WHERE NOT ST_IsEmpty(r.geom)
        $q$, raw_buildings);
        GET DIAGNOSTICS nb = ROW_COUNT;
    END IF;

    IF raw_addresses IS NOT NULL THEN
        EXECUTE has_col INTO found USING raw_addresses, 'rue_nm';
        IF found THEN
            -- ICAR shapefile of the full download
            street := 'rue_nm'; num := 'adr_numero'; postcode := 'code_posta::text'; municipality := 'com_nm';
        ELSE
            EXECUTE has_col INTO found USING raw_addresses, 'rue_nom';
            IF NOT found THEN
                RAISE EXCEPTION 'picc.load_raw: unknown address format in % (no rue_nm or rue_nom column)', raw_addresses;
            END IF;
            -- ADRESS_POINT (province downloads, ArcGIS updates): the postcode is a number, possibly a float
            street := 'rue_nom'; num := 'numero';
            postcode := 'CASE WHEN codepostal::text ~ ''^[0-9]+(\.0+)?$'' THEN codepostal::numeric::int::text END';
            municipality := 'commu_nom';
        END IF;
        EXECUTE has_col INTO found USING raw_addresses, 'objectid';
        IF found THEN
            objectid_expr := 'objectid::bigint';
            IF replace THEN
                EXECUTE format('DELETE FROM picc.addresses WHERE objectid IN (SELECT objectid::bigint FROM %s)', raw_addresses);
            END IF;
        END IF;
        EXECUTE format($q$
            INSERT INTO picc.addresses (objectid, street, house_number, postcode, municipality, geom)
            SELECT %s, nullif(%s::text, ''), nullif(%s::text, ''), nullif(%s, ''), nullif(%s::text, ''),
                   ST_Force2D(ST_SetSRID(ST_GeometryN(geom, 1), 31370))
            FROM %s
            WHERE geom IS NOT NULL AND ST_Dimension(geom) = 0 AND NOT ST_IsEmpty(geom)
        $q$, objectid_expr, street, num, postcode, municipality, raw_addresses);
        GET DIAGNOSTICS na = ROW_COUNT;
    END IF;

    RETURN QUERY SELECT nb, na;
END;
$fn$;
