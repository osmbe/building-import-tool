# webhook/restore-urbis.sh publishes the dump of a CI UrbIS import (schema urbis_next, like
# .github/workflows/urbis-import.yml) next to the live data and swaps it in.
reset_db fresh
fixtures urbis
just_run urbis-import >/dev/null 2>&1
psql_db -c "ALTER SCHEMA urbis RENAME TO urbis_next" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_dump -U be2osm --no-owner --no-acl -n urbis_next be2osm | gzip | artifact 7100 urbis-dump urbis.sql.gz

reset_db fresh
just_run db-migrate >/dev/null
out=$(webhook_run -e RESTART_TILES=0 webhook bash /repo/webhook/restore-urbis.sh 7100 osmbe/building-import-tool 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "the restore succeeds"
[ "$rc" = 0 ] || log "$out"
assert_eq "$(sql "SELECT string_agg(building_id || ':' || address_count, ',' ORDER BY building_id) FROM urbis.buildings_with_addresses")" \
  "21:2,22:0" "the live schema has the dump's data"
assert_eq "$(sql "SELECT count(*) FROM pg_namespace WHERE nspname IN ('urbis_next', 'urbis_prev')")" "0" "nothing is left next to it"
