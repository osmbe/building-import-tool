# API integration tests (app/tests/integration) against the imported fixtures of every source plus OSM
# buildings that match some of them. Runs vitest on the host against the test database.
reset_db fresh
for src in grb picc urbis; do fixtures "$src"; done
just_run grb-import >/dev/null
just_run picc-import >/dev/null
just_run urbis-import >/dev/null
psql_db -d osmbe -c "TRUNCATE osm.osm_buildings" >/dev/null
psql_db -d osmbe -f - <"$ROOT/tests/fixtures/osm/buildings.sql" >/dev/null

if (cd "$ROOT/app" && TEST_PG_PORT="${TEST_PG_PORT:-55432}" npx vp test run tests/integration); then
  pass "API integration tests"
else
  fail "API integration tests"
fi
