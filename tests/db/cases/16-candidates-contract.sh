# Every source exposes its buildings through the same contract: grb.candidates, grb.knw_candidates,
# picc.candidates and urbis.candidates have the same columns with the same types, in the same order. The
# difference API and the Martin "candidates" sources read only these views.
reset_db fresh
for src in grb picc urbis; do fixtures "$src"; done
just_run grb-import >/dev/null
just_run picc-import >/dev/null 2>&1
just_run urbis-import >/dev/null 2>&1

VIEWS=(grb.candidates grb.knw_candidates picc.candidates urbis.candidates)

columns_of() { # <schema.view>
    sql "SELECT string_agg(column_name || ' ' || udt_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns
        WHERE table_schema = split_part('$1', '.', 1) AND table_name = split_part('$1', '.', 2)"
}
contract=$(columns_of grb.candidates)
assert_eq "$contract" "fid int8, source text, entity text, source_id text, source_ref text, type_code text, type_label text, survey_date text, origin_label text, area_m2 float4, parent_id text, parent_type_label text, parent_part_count int4, parent_area_m2 float4, addresses text, street_names text, postcodes text, municipalities text, address_count int4, details jsonb, geom geometry" \
    "grb.candidates has the contract columns"
for view in "${VIEWS[@]:1}"; do
    assert_eq "$(columns_of "$view")" "$contract" "$view has the same columns, types and order"
done

for view in "${VIEWS[@]}"; do
    assert_true "SELECT srid = 3857 FROM geometry_columns WHERE f_table_schema || '.' || f_table_name = '$view'" \
        "$view registers its geometry in EPSG:3857 (Martin)"
    assert_true "SELECT count(*) > 0 AND count(*) = count(DISTINCT fid) FROM $view" "$view has rows with a unique fid"
    plan=$(psql_db -c "SET enable_seqscan = off; EXPLAIN SELECT fid FROM $view WHERE geom && ST_MakeEnvelope(489000, 6659000, 491000, 6661000, 3857)")
    grep -q 'Index' <<<"$plan" && pass "$view: a bounding box query uses the spatial index" ||
        fail "$view: a bounding box query uses the spatial index"
done

# One row per source object
assert_true "SELECT (SELECT count(*) FROM grb.candidates) = (SELECT count(*) FROM grb.building_polygons)
    AND NOT EXISTS (SELECT entity || '/' || oidn FROM grb.building_polygons EXCEPT SELECT source_ref FROM grb.candidates)" \
    "grb.candidates has every building polygon, referenced as Entity/oidn"
assert_true "SELECT (SELECT count(*) FROM grb.knw_candidates) = (SELECT count(*) FROM grb.kunstwerken)" \
    "grb.knw_candidates has every kunstwerk"
assert_true "SELECT (SELECT count(*) FROM picc.candidates) = (SELECT count(*) FROM picc.buildings)" "picc.candidates has every building"
assert_true "SELECT (SELECT count(*) FROM urbis.candidates) = (SELECT count(*) FROM urbis.buildings)" "urbis.candidates has every building"

row() { # <view> <where>
    sql "SELECT array_to_string(ARRAY[source, entity, source_id, source_ref, type_code, type_label, survey_date, parent_id,
        addresses, street_names, postcodes, municipalities, address_count::text], ' | ', '-') FROM $1 WHERE $2"
}
assert_eq "$(row grb.candidates "source_ref = 'Gbg/1001'")" \
    "grb | Gbg | 1001 | Gbg/1001 | - | hoofdgebouw | 2023-03-15 | 5001 | Kerkstraat 1 | Kerkstraat | 2000 | Antwerpen | 1" \
    "a GRB polygon: entity, oidn, type, survey date, building and address"
assert_eq "$(row grb.candidates "source_ref = 'Gba/1001'")" "grb | Gba | 1001 | Gba/1001 | - | verdieping | 2023-03-15 | - |  |  |  |  | 0" \
    "the GBA polygon sharing its OIDN is a separate candidate"
assert_eq "$(row grb.knw_candidates "source_id = '7001'")" "knw | Knw | 7001 | Knw/7001 | 7 | schoorsteen | 2022-01-10 | - | - | - | - | - | 0" \
    "a kunstwerk: type code and label, survey date"
assert_eq "$(row picc.candidates "source_id = '11'")" "picc | - | 11 | - | BAT | Batiment | 2019-05-20 | - | Rue de Fer 5 | Rue de Fer | 5000 | Namur | 1" \
    "a PICC building: nature code and label, survey date (date levé), address"
assert_eq "$(row urbis.candidates "source_id = '21'")" "urbis | - | 21 | - | - | - | - | 901 | Rue Neuve 10; Rue Neuve 10/2 | Rue Neuve | 1000 | Bruxelles | 2" \
    "an Urbis building: id and addresses"
assert_eq "$(sql "SELECT details FROM picc.candidates WHERE source_id = '11'")" '{"georef_id": "G-11", "date_modif": "2020-01-01"}' \
    "source-specific extras are in details"
