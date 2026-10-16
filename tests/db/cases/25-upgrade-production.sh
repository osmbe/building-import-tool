# Upgrading the production schema (snapshot taken by scripts/server-bootstrap.sh, committed as
# tests/db/schemas/be2osm-production.sql) with every migration keeps its data. Skipped until the snapshot exists.
if [ ! -f "$ROOT/tests/db/schemas/be2osm-production.sql" ]; then
    log "skipped: tests/db/schemas/be2osm-production.sql is not committed yet (see docs/RUNBOOK.md)"
    return 0
fi
reset_db production

psql_db -c "
INSERT INTO grb.building_polygons (oidn, type_label, geom) VALUES
 (2664, 'hoofdgebouw', ST_GeomFromText('POLYGON((4.40 51.20,4.4001 51.20,4.4001 51.2001,4.40 51.2001,4.40 51.20))', 4326)),
 (2665, 'verdieping',  ST_GeomFromText('POLYGON((4.41 51.20,4.4101 51.20,4.4101 51.2001,4.41 51.2001,4.41 51.20))', 4326));" >/dev/null
psql_db -c "REFRESH MATERIALIZED VIEW grb.buildings_with_addresses" >/dev/null 2>&1 || true

# Like the bootstrap: a deploy may have applied the light migrations first, then everything is applied
"${COMPOSE[@]}" run --rm -T processing just db-migrate --deploy >/dev/null 2>&1 || true
just_run db-migrate >/dev/null
assert_eq "$(sql "SELECT string_agg(entity || '/' || oidn, ',' ORDER BY oidn) FROM grb.building_polygons")" \
    "Gbg/2664,Gba/2665" "the polygons are kept and get their entity"
assert_eq "$(sql "SELECT count(*) FROM grb.buildings_with_addresses")" "2" "the view is rebuilt with entity"
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "3" "every GRB migration is recorded"
just_run db-migrate >/dev/null
assert_eq "$(sql "SELECT count(*) FROM grb.schema_migrations")" "3" "a second run changes nothing"
