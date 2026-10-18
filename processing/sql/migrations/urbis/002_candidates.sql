-- UrbIS side of the candidates contract: see processing/sql/migrations/grb/004_candidates.sql for the columns.
-- The parent is the UrbIS building block.
CREATE OR REPLACE VIEW urbis.candidates AS
SELECT
    b.building_id::bigint AS fid,
    'urbis'::text AS source,
    NULL::text AS entity,
    b.building_id::text AS source_id,
    NULL::text AS source_ref,
    NULL::text AS type_code,
    NULL::text AS type_label,
    NULL::text AS survey_date,
    NULL::text AS origin_label,
    b.area_m2::real AS area_m2,
    b.block_id::text AS parent_id,
    NULL::text AS parent_type_label,
    NULL::integer AS parent_part_count,
    NULL::real AS parent_area_m2,
    b.addresses::text AS addresses,
    b.street_names::text AS street_names,
    b.postcodes::text AS postcodes,
    b.municipalities::text AS municipalities,
    b.address_count::integer AS address_count,
    '{}'::jsonb AS details,
    b.geom
FROM urbis.buildings_with_addresses b;
