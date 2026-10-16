-- Apply a GRB difference file (verschilbestand) to grb.building_polygons, in one transaction.
--
-- Digitaal Vlaanderen delivers a delete file and an add file per entity. An object version in the delete file
-- is removed (matched on UIDN, the version id; OIDN when an old row has no UIDN), every object in the add file
-- is added. An OIDN in both files is a changed object, one only in the delete file a removed object.
-- See https://www.vlaanderen.be/digitaal-vlaanderen/onze-diensten-en-platformen/basiskaart-vlaanderen-grb/veelgestelde-vragen/verschilbestanden-grb
--
-- Input (loaded by `just _grb-import-diff-building-polygons` with ogr2ogr, lowercase shapefile columns plus
-- an `entity` column, 'Gbg' or 'Gba'): grb._diff_del (uidn, oidn) and grb._diff_add (the Gbg/Gba columns).
-- Changed GBG polygons keep their gebouw_id (the diff has no RltGbgGebouw). Re-applying the same or an
-- overlapping diff gives the same result: removed versions are gone already and adds are upserts.

\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE diff_removed ON COMMIT DROP AS
WITH removed AS (
    DELETE FROM grb.building_polygons bp
    USING grb._diff_del d
    WHERE bp.entity = d.entity
      AND (bp.uidn = d.uidn::bigint OR (bp.uidn IS NULL AND bp.oidn = d.oidn::bigint))
    RETURNING bp.entity, bp.oidn, bp.gebouw_id
)
SELECT * FROM removed;

INSERT INTO grb.building_polygons (entity, oidn, uidn, gebouw_id, type_code, type_label, area_m2, length_m, version,
    origin_code, origin_label, opndatum_raw, survey_date, geom)
SELECT
    a.entity,
    a.oidn::bigint,
    a.uidn::bigint,
    r.gebouw_id,
    a.type::integer,
    a.lbltype,
    a.oppervl::real,
    a.lengte::real,
    a.versie::integer,
    a.bgninv::integer,
    a.lblbgninv,
    a.opndatum,
    CASE
        WHEN a.opndatum ~ '^\d{4}-\d{2}-\d{2}$' THEN a.opndatum::date
        WHEN a.opndatum ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(a.opndatum, 'DD/MM/YYYY')
    END,
    a.geom
FROM grb._diff_add a
LEFT JOIN diff_removed r ON r.entity = a.entity AND r.oidn = a.oidn::bigint
ON CONFLICT (entity, oidn) DO UPDATE SET
    uidn = EXCLUDED.uidn,
    gebouw_id = coalesce(EXCLUDED.gebouw_id, grb.building_polygons.gebouw_id),
    type_code = EXCLUDED.type_code,
    type_label = EXCLUDED.type_label,
    area_m2 = EXCLUDED.area_m2,
    length_m = EXCLUDED.length_m,
    version = EXCLUDED.version,
    origin_code = EXCLUDED.origin_code,
    origin_label = EXCLUDED.origin_label,
    opndatum_raw = EXCLUDED.opndatum_raw,
    survey_date = EXCLUDED.survey_date,
    geom = EXCLUDED.geom,
    geom_mercator = NULL; -- recomputed by the trigger

SELECT format('   removed: %s, changed: %s, added (or already present): %s',
    (SELECT count(*) FROM diff_removed r
     WHERE NOT EXISTS (SELECT 1 FROM grb._diff_add a WHERE a.entity = r.entity AND a.oidn::bigint = r.oidn)),
    (SELECT count(*) FROM grb._diff_add a
     WHERE EXISTS (SELECT 1 FROM diff_removed r WHERE a.entity = r.entity AND a.oidn::bigint = r.oidn)),
    (SELECT count(*) FROM grb._diff_add a
     WHERE NOT EXISTS (SELECT 1 FROM diff_removed r WHERE a.entity = r.entity AND a.oidn::bigint = r.oidn))) AS summary
\gset
\echo :summary

DROP TABLE grb._diff_add, grb._diff_del;
COMMIT;
