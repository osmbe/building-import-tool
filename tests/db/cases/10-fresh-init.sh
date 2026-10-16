# A fresh volume (production init scripts) plus `just db-migrate` gives the current GRB schema,
# and applying the migrations again changes nothing.
reset_db fresh

just_run db-migrate >/dev/null
assert_true "SELECT EXISTS (SELECT 1 FROM pg_matviews WHERE schemaname = 'grb' AND matviewname = 'buildings_with_addresses')" \
    "db-migrate creates grb.buildings_with_addresses"
assert_true "SELECT count(*) = 2 FROM pg_attribute WHERE attrelid = 'grb.buildings_with_addresses'::regclass AND attname IN ('entity', 'polygon_id') AND NOT attisdropped" \
    "the view has entity and polygon_id"
assert_true "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_polygons_entity_oidn_key')" \
    "building_polygons is unique on (entity, oidn)"
assert_true "SELECT NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'building_polygons_oidn_key')" \
    "the old UNIQUE (oidn) is gone"

before=$(psql_db -c "SELECT md5(string_agg(format('%s.%s:%s', table_name, column_name, data_type), ',' ORDER BY 1)) FROM information_schema.columns WHERE table_schema = 'grb'")
just_run db-migrate >/dev/null
after=$(psql_db -c "SELECT md5(string_agg(format('%s.%s:%s', table_name, column_name, data_type), ',' ORDER BY 1)) FROM information_schema.columns WHERE table_schema = 'grb'")
assert_eq "$after" "$before" "running db-migrate twice leaves the schema unchanged"
