-- The candidates contract (data plan P3): every source exposes its buildings with the same columns, types and
-- order, so the difference API, the Martin "candidates" sources and the app read every source the same way.
-- tests/db/cases/16-candidates-contract.sh checks that the four views (grb.candidates, grb.knw_candidates,
-- picc.candidates, urbis.candidates) stay identical in shape.
--
--   fid             unique, stable feature id (tile feature id)
--   source          grb | knw | picc | urbis
--   entity          GRB entity (Gbg, Gba, Knw); NULL elsewhere
--   source_id       the object's id in the source (OIDN, PICC objectid, Urbis id)
--   source_ref      reference written to OSM as source:geometry:ref (Entity/OIDN); NULL when the source has none
--   type_code       source type code (KNW type, PICC nature code)
--   type_label      source type label (GRB LBLTYPE, KNW type, PICC nature)
--   survey_date     YYYY-MM-DD (source:geometry:date)
--   origin_label    how the geometry was measured (GRB, KNW)
--   area_m2         area of the polygon
--   parent_*        the object this polygon belongs to: the GRB building (gebouw_id) or the Urbis building block
--   addresses ...   addresses inside the polygon (text lists) and their count; NULL / 0 for KNW
--   details         remaining source-specific fields (API only, not in tiles)
--   geom            EPSG:3857
--
-- Plain views over the existing materialized views and tables, so they cost no storage or refresh. A migration
-- that rebuilds a materialized view with DROP ... CASCADE must recreate the candidates view on top of it.

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
    '{}'::jsonb AS details,
    bwa.geom
FROM grb.buildings_with_addresses bwa;

CREATE OR REPLACE VIEW grb.knw_candidates AS
SELECT
    k.oidn::bigint AS fid,
    'knw'::text AS source,
    'Knw'::text AS entity,
    k.oidn::text AS source_id,
    ('Knw/' || k.oidn)::text AS source_ref,
    k.type_code::text AS type_code,
    k.type_label::text AS type_label,
    to_char(k.survey_date, 'YYYY-MM-DD') AS survey_date,
    k.origin_label::text AS origin_label,
    k.area_m2::real AS area_m2,
    NULL::text AS parent_id,
    NULL::text AS parent_type_label,
    NULL::integer AS parent_part_count,
    NULL::real AS parent_area_m2,
    NULL::text AS addresses,
    NULL::text AS street_names,
    NULL::text AS postcodes,
    NULL::text AS municipalities,
    0 AS address_count,
    jsonb_build_object('uidn', k.uidn, 'length_m', k.length_m) AS details,
    k.geom_mercator AS geom
FROM grb.kunstwerken k;
