#!/usr/bin/env bash
# The CI PICC import: each province is loaded into raw tables and dumped in its own database
# (picc-province-load), then picc-finalize-provinces merges the dumps. Province downloads use the ADRESS_POINT
# address format (float postcodes) and can repeat an objectid.
reset_db fresh
fixtures picc-provinces
for province in NAMUR LIEGE; do
  reset_db fresh
  just_run picc-province-load "$province" >/dev/null 2>&1
done
reset_db fresh
out=$(just_run picc-finalize-provinces data/picc 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "the provinces are merged"
[ "$rc" = 0 ] || log "$(tail -20 <<<"$out")"

assert_eq "$(sql "SELECT string_agg(fid || '=' || objectid || ':' || georef_id, ',' ORDER BY fid) FROM picc.buildings")" \
  "11=11:G-11,12=12:G-12,10000000011=11:G-11-LG" "a repeated objectid gets its own stable fid"
assert_eq "$(sql "SELECT string_agg(objectid || ':' || addresses || ':' || postcodes || ':' || municipalities, ',' ORDER BY fid) FROM picc.buildings_with_addresses WHERE address_count > 0")" \
  "11:Rue de Fer 5:5000:Namur,11:Rue Leopold 1:4000:Liege" \
  "ADRESS_POINT addresses give the same result as ICAR ones (postcode 5000, not 5000.0)"
assert_true "SELECT indisunique FROM pg_index WHERE indexrelid = 'picc.picc_bwa_fid_idx'::regclass" \
  "the view has a unique fid despite the repeated objectid"
out=$(psql_db -c "REFRESH MATERIALIZED VIEW CONCURRENTLY picc.buildings_with_addresses" 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "so it refreshes concurrently"
