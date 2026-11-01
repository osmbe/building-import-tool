# GRB address summaries: main addresses only, one street per polygon, odd/even house-number ranges and the
# building:flats count (issues #130, #135 and #136). The shared GRB fixture keeps one address, so this case
# inserts controlled polygons and addresses directly.
reset_db fresh
just_run db-migrate >/dev/null

summary() { sql "SELECT grb.summarize_house_numbers($1)"; }
assert_eq "$(summary "ARRAY['1','3','5']::text[]")" "1-5" "1,3,5 summarizes to an odd range"
assert_eq "$(summary "ARRAY['1','3']::text[]")" "1,3" "two values stay a list"
assert_eq "$(summary "ARRAY['1','5']::text[]")" "1,5" "a gap splits the run"
assert_eq "$(summary "ARRAY['2','4','6']::text[]")" "2-6" "even values summarize to an even range"
assert_eq "$(summary "ARRAY['1','1A','3','5']::text[]")" "1,1A,3-5" "letter variants stay separate but the remaining run is a range"
assert_eq "$(summary "ARRAY['1','2','3','5']::text[]")" "1,2,3,5" "mixed odd/even values disable ranges"
assert_eq "$(summary "ARRAY['1','3','5','9','11']::text[]")" "1-5,9-11" "a gap splits into two ranges"
assert_eq "$(summary "ARRAY['1','3','9']::text[]")" "1-3,9" "a two-value run is a range when the set has more than two bases"
assert_eq "$(summary "ARRAY['1','3','5','9']::text[]")" "1-5,9" "a single remaining value stays a value"
assert_eq "$(summary "ARRAY['1','1A','3']::text[]")" "1,1A,3" "a two-value run with a variant is not a range in a two-base set"
assert_eq "$(summary "ARRAY['12/3','1','3','5']::text[]")" "1-5,12/3" "opaque values are kept verbatim after the ranges"
assert_eq "$(summary "ARRAY['01','1A','0003','3a','3A']::text[]")" "1,1A,3,3A" "values are normalized and variants deduplicated"
assert_eq "$(summary "ARRAY[' 01 ','1 a','0003']::text[]")" "1,1A,3" "whitespace is trimmed and removed inside a value"

psql_db -f - <<'SQL' >/dev/null
INSERT INTO grb.building_polygons (entity, oidn, type_label, survey_date, geom) VALUES
 ('Gbg', 2001, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326), 0.0001)),
 ('Gbg', 2002, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.401, 51.200), 4326), 0.0001)),
 ('Gbg', 2003, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.402, 51.200), 4326), 0.0001)),
 ('Gbg', 2004, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.403, 51.200), 4326), 0.0001)),
 ('Gbg', 2005, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.404, 51.200), 4326), 0.0001)),
 ('Gbg', 2006, 'hoofdgebouw', '2023-01-01', ST_Buffer(ST_SetSRID(ST_MakePoint(4.405, 51.200), 4326), 0.0001));

INSERT INTO grb.addresses (oidn, adres_id, street_name, house_number, box_number, postcode, municipality, full_address, geom) VALUES
 -- 2001: main 1, 1A, 3, 5 and a subaddress that must not enter the address value
 (21001, 21001, 'Kerkstraat', '1',  NULL, '2000', 'Antwerpen', 'Kerkstraat 1',    ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326)),
 (21002, 21002, 'Kerkstraat', '1A', NULL, '2000', 'Antwerpen', 'Kerkstraat 1A',   ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326)),
 (21003, 21003, 'Kerkstraat', '3',  NULL, '2000', 'Antwerpen', 'Kerkstraat 3',    ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326)),
 (21004, 21004, 'Kerkstraat', '5',  NULL, '2000', 'Antwerpen', 'Kerkstraat 5',    ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326)),
 (21005, 21005, 'Kerkstraat', '1',  '1',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 1', ST_SetSRID(ST_MakePoint(4.400, 51.200), 4326)),
 -- 2002: main 1 with two subs + standalone main 3 -> 3 flats
 (22001, 22001, 'Kerkstraat', '1',  NULL, '2000', 'Antwerpen', 'Kerkstraat 1',    ST_SetSRID(ST_MakePoint(4.401, 51.200), 4326)),
 (22002, 22002, 'Kerkstraat', '1',  '1',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 1', ST_SetSRID(ST_MakePoint(4.401, 51.200), 4326)),
 (22003, 22003, 'Kerkstraat', '1',  '2',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 2', ST_SetSRID(ST_MakePoint(4.401, 51.200), 4326)),
 (22004, 22004, 'Kerkstraat', '3',  NULL, '2000', 'Antwerpen', 'Kerkstraat 3',    ST_SetSRID(ST_MakePoint(4.401, 51.200), 4326)),
 -- 2003: one main with one sub -> no building:flats tag
 (23001, 23001, 'Kerkstraat', '1',  NULL, '2000', 'Antwerpen', 'Kerkstraat 1',    ST_SetSRID(ST_MakePoint(4.402, 51.200), 4326)),
 (23002, 23002, 'Kerkstraat', '1',  '1',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 1', ST_SetSRID(ST_MakePoint(4.402, 51.200), 4326)),
 -- 2004: only subaddresses -> 2 flats, no address value
 (24001, 24001, 'Kerkstraat', '1',  '1',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 1', ST_SetSRID(ST_MakePoint(4.403, 51.200), 4326)),
 (24002, 24002, 'Kerkstraat', '1',  '2',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 2', ST_SetSRID(ST_MakePoint(4.403, 51.200), 4326)),
 -- 2005: two streets -> no address tags, but the subaddress still counts -> 2 flats
 (25001, 25001, 'Kerkstraat', '1',  NULL, '2000', 'Antwerpen', 'Kerkstraat 1',    ST_SetSRID(ST_MakePoint(4.404, 51.200), 4326)),
 (25002, 25002, 'Dorpsstraat', '2', NULL, '2000', 'Antwerpen', 'Dorpsstraat 2',   ST_SetSRID(ST_MakePoint(4.404, 51.200), 4326)),
 (25003, 25003, 'Kerkstraat', '1',  '1',  '2000', 'Antwerpen', 'Kerkstraat 1 bus 1', ST_SetSRID(ST_MakePoint(4.404, 51.200), 4326));
SQL

sql "REFRESH MATERIALIZED VIEW grb.buildings_with_addresses" >/dev/null

view_row() { # <oidn>
    sql "SELECT concat_ws(' | ', addresses, street_names, postcodes, municipalities, address_count::text,
        street_name, house_numbers, flats::text) FROM grb.buildings_with_addresses WHERE oidn = $1"
}
assert_eq "$(view_row 2001)" "Kerkstraat 1,1A,3-5 | Kerkstraat | 2000 | Antwerpen | 4 | Kerkstraat | 1,1A,3-5 | 4" \
    "one street: summarized main addresses, subaddress excluded, flats counts the subaddress"
assert_eq "$(view_row 2002)" "Kerkstraat 1,3 | Kerkstraat | 2000 | Antwerpen | 2 | Kerkstraat | 1,3 | 3" \
    "main with two subs + standalone main: address value and 3 flats"
assert_eq "$(view_row 2003)" "Kerkstraat 1 | Kerkstraat | 2000 | Antwerpen | 1 | Kerkstraat | 1 | 1" \
    "main with one sub: one flat, no building:flats tag"
assert_eq "$(view_row 2004)" " |  |  |  | 0 |  |  | 2" "only subaddresses: no address value, but 2 flats"
assert_eq "$(view_row 2005)" " |  | 2000 | Antwerpen | 0 |  |  | 2" \
    "two streets: address columns empty, but flats is still calculated"
assert_eq "$(view_row 2006)" " |  |  |  | 0 |  |  | 0" "no addresses: everything empty"

detail() { # <oidn>
    sql "SELECT COALESCE(details->>'street', '') || '|' || COALESCE(details->>'house_numbers', '') || '|'
        || COALESCE(details->>'flats', '') FROM grb.candidates WHERE source_id = '$1'"
}
assert_eq "$(detail 2001)" "Kerkstraat|1,1A,3-5|4" "candidate details carry street, house numbers and flats"
assert_eq "$(detail 2003)" "Kerkstraat|1|" "flats=1 is left out of the details"
assert_eq "$(detail 2004)" "||2" "only subaddresses: details carry flats only"
assert_eq "$(detail 2006)" "||" "no address details means an empty details object"
assert_eq "$(sql "SELECT details FROM grb.candidates WHERE source_id = '2006'")" "{}" "empty details is an empty object"
