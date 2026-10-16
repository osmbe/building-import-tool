-- PICC side of the candidates contract: see processing/sql/migrations/grb/004_candidates.sql for the columns.
CREATE OR REPLACE VIEW picc.candidates AS
SELECT
    b.fid::bigint AS fid,
    'picc'::text AS source,
    NULL::text AS entity,
    b.objectid::text AS source_id,
    NULL::text AS source_ref,
    b.natur_code::text AS type_code,
    b.natur_desc::text AS type_label,
    to_char(b.date_leve, 'YYYY-MM-DD') AS survey_date,
    NULL::text AS origin_label,
    b.area_m2::real AS area_m2,
    NULL::text AS parent_id,
    NULL::text AS parent_type_label,
    NULL::integer AS parent_part_count,
    NULL::real AS parent_area_m2,
    b.addresses::text AS addresses,
    b.street_names::text AS street_names,
    b.postcodes::text AS postcodes,
    b.municipalities::text AS municipalities,
    b.address_count::integer AS address_count,
    jsonb_build_object('georef_id', b.georef_id, 'date_modif', to_char(b.date_modif, 'YYYY-MM-DD')) AS details,
    b.geom
FROM picc.buildings_with_addresses b;
