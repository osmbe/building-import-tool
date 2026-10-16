# A fresh volume (production init scripts) plus `just db-migrate` gives the current GRB schema,
# and applying the migrations again changes nothing.
reset_db fresh
assert_eq "$(sql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'grb'")" "0" \
    "the init scripts only create the grb schema (its tables come from the migrations)"

just_run db-migrate >/dev/null
assert_true "SELECT EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'grb' AND matviewname = 'buildings_with_addresses')" \
    "db-migrate creates grb.buildings_with_addresses"
assert_true "SELECT count(*) = 2 FROM pg_attribute WHERE attrelid = 'grb.buildings_with_addresses'::regclass AND attname IN ('entity', 'polygon_id') AND NOT attisdropped" \
    "the view has entity and polygon_id"
assert_true "SELECT indisunique AND indisvalid FROM pg_index WHERE indexrelid = 'grb.building_polygons_entity_oidn_key'::regclass" \
    "building_polygons is unique on (entity, oidn)"
assert_eq "$(sql "SELECT string_agg(version, ',' ORDER BY version) FROM grb.schema_migrations")" \
    "000_baseline,001_polygon_entity,002_polygon_entity_unique,003_buildings_with_addresses_entity" "every GRB migration is recorded"
assert_true "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_polygons_oidn_key')" \
    "the old UNIQUE (oidn) is gone"

before=$(psql_db -c "SELECT md5(string_agg(format('%s.%s:%s', table_name, column_name, data_type), ',' ORDER BY 1)) FROM information_schema.columns WHERE table_schema = 'grb'")
just_run db-migrate >/dev/null
after=$(psql_db -c "SELECT md5(string_agg(format('%s.%s:%s', table_name, column_name, data_type), ',' ORDER BY 1)) FROM information_schema.columns WHERE table_schema = 'grb'")
assert_eq "$after" "$before" "running db-migrate twice leaves the schema unchanged"

# The GRB catalog (columns, constraints, indexes, triggers, views) a fresh database gets from the migrations
# is the one an old database (7088df9) is migrated to: a CI import (fresh) is swapped in on the server
# (migrated), and both releases must work on either.
grb_catalog() {
    sql "SELECT string_agg(item, E'\\n' ORDER BY item) FROM (
        SELECT format('column %s.%s %s %s %s', table_name, column_name, data_type, is_nullable, column_default) AS item
        FROM information_schema.columns WHERE table_schema = 'grb'
        UNION ALL SELECT format('constraint %s %s', conname, pg_get_constraintdef(oid)) FROM pg_constraint WHERE connamespace = 'grb'::regnamespace
        UNION ALL SELECT format('index %s', pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'grb'::regnamespace)
        UNION ALL SELECT format('trigger %s', pg_get_triggerdef(oid)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'grb'::regnamespace)
        UNION ALL SELECT format('relation %s %s', relname, relkind) FROM pg_class WHERE relnamespace = 'grb'::regnamespace
    ) catalog"
}
fresh_catalog=$(grb_catalog)
grep -q '^trigger CREATE TRIGGER building_polygons_before_update' <<<"$fresh_catalog" &&
    pass "the migrations create the GRB triggers" || fail "the migrations create the GRB triggers"
reset_db v7088
just_run db-migrate >/dev/null
upgraded_catalog=$(grb_catalog)
if [ "$fresh_catalog" = "$upgraded_catalog" ]; then
    pass "a fresh and an upgraded database have the same GRB catalog"
else
    fail "a fresh and an upgraded database have the same GRB catalog"
    diff <(echo "$fresh_catalog") <(echo "$upgraded_catalog") | sed 's/^/      /' || true
fi
