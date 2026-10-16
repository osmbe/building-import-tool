# The PICC ArcGIS update (picc-update without the fetch): the changed buildings and addresses replace the stored
# ones with the same objectid, in one transaction. The next update starts from picc.import_meta.
reset_db fresh
fixtures picc
just_run picc-import >/dev/null 2>&1
fixtures picc-diff
out=$(just_run _picc-apply-diff 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "the changes are applied"
[ "$rc" = 0 ] || log "$(tail -20 <<<"$out")"
just_run _picc-refresh-matview >/dev/null 2>&1
assert_eq "$(sql "SELECT string_agg(fid || ':' || natur_code || ':' || date_leve, ',' ORDER BY fid) FROM picc.buildings")" \
    "11:BAT:2019-05-20,12:BAT:2026-03-01,13:BAT:2026-03-01" "12 is replaced by its new version, 13 is added"
assert_eq "$(sql "SELECT string_agg(objectid || ':' || addresses, ',' ORDER BY objectid) FROM picc.buildings_with_addresses WHERE address_count > 0")" \
    "11:Rue de Fer 5,13:Rue de Fer 9" "the new address is joined to the new building"

fixtures picc-diff
just_run _picc-apply-diff >/dev/null 2>&1
assert_eq "$(sql "SELECT (SELECT count(*) FROM picc.buildings) || '/' || (SELECT count(*) FROM picc.addresses)")" "3/2" \
    "applying the same changes again adds nothing"

psql_db -c "DELETE FROM picc.import_meta; INSERT INTO picc.import_meta VALUES ('2026-10-01 18:30:00+00')" >/dev/null
assert_eq "$(just_run _picc-last-update 2>/dev/null)" "2026-10-01T00:00:00Z" "the next update starts on the day of the last import"
