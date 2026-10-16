# Start the four Martin tile servers with the production configs (config/martin/*.yaml) against imported
# fixtures: each must connect (config env substitution), publish its sources with the configured properties and
# serve a non-empty tile at a fixture location. Guards against Martin upgrades breaking the configs.
reset_db fresh
for src in grb picc urbis; do fixtures "$src"; done
just_run grb-import >/dev/null
just_run picc-import >/dev/null
just_run urbis-import >/dev/null
psql_db -d osmbe -c "INSERT INTO osm.osm_buildings (osm_id, building_type, tags, geom) VALUES
  (42, 'yes', '{\"building\": \"yes\"}', ST_GeomFromText('POLYGON((4.4000 51.2000,4.4001 51.2000,4.4001 51.20007,4.4000 51.20007,4.4000 51.2000))', 4326))" >/dev/null

martin_up martin-grb martin-osm martin-picc martin-urbis

check_martin() { # <service> <source> <lon> <lat> <required properties...>
    local svc="$1" src="$2" lon="$3" lat="$4"
    shift 4
    local port tilejson z x y code
    port=$(martin_port "$svc")
    if ! curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
        fail "$svc is not healthy"
        martin_logs "$svc" | tail -5 | sed 's/^/      /'
        return
    fi
    pass "$svc starts with the production config"
    tilejson=$(curl -fsS "http://127.0.0.1:${port}/${src}" 2>/dev/null || true)
    local missing=()
    for prop in "$@"; do
        python3 -c "import json,sys; d=json.loads(sys.argv[1]); sys.exit(0 if sys.argv[2] in d['vector_layers'][0]['fields'] else 1)" "$tilejson" "$prop" 2>/dev/null || missing+=("$prop")
    done
    if [ "${#missing[@]}" -eq 0 ]; then pass "$svc/$src publishes the configured properties"; else fail "$svc/$src lacks properties: ${missing[*]}"; fi
    read -r z x y < <(tile_xyz "$lon" "$lat" 16)
    code=$(curl -s -o /tmp/tile.$$ -w '%{http_code}' "http://127.0.0.1:${port}/${src}/${z}/${x}/${y}")
    if [ "$code" = "200" ] && [ "$(wc -c </tmp/tile.$$)" -gt 0 ]; then pass "$svc/$src serves a non-empty tile at the fixture"; else fail "$svc/$src tile ${z}/${x}/${y}: HTTP $code"; fi
    rm -f /tmp/tile.$$
    if martin_logs "$svc" | grep -q ' ERROR '; then fail "$svc logged errors"; martin_logs "$svc" | grep ' ERROR ' | head -3 | sed 's/^/      /'; fi
}

check_martin martin-grb buildings 4.40005 51.20003 polygon_id entity oidn polygon_type_label survey_date addresses address_count
check_martin martin-grb kunstwerken 4.40505 51.20003 oidn entity type_code type_label
check_martin martin-osm osm_buildings 4.40005 51.20003 osm_id tags
check_martin martin-picc buildings 4.87005 50.46503 objectid natur_code date_leve addresses
check_martin martin-urbis buildings 4.35005 50.84603 building_id addresses address_count
# The candidates contract: the same properties for every source
CONTRACT=(fid source entity source_id source_ref type_code type_label survey_date origin_label area_m2 parent_id
    parent_type_label parent_part_count parent_area_m2 addresses street_names postcodes municipalities address_count)
check_martin martin-grb candidates 4.40005 51.20003 "${CONTRACT[@]}"
check_martin martin-grb knw_candidates 4.40505 51.20003 "${CONTRACT[@]}"
check_martin martin-picc candidates 4.87005 50.46503 "${CONTRACT[@]}"
check_martin martin-urbis candidates 4.35005 50.84603 "${CONTRACT[@]}"
# details (jsonb) reaches the tiles as one property per key
read -r z x y < <(tile_xyz 4.87005 50.46503 16)
if curl -fsS "http://127.0.0.1:$(martin_port martin-picc)/candidates/${z}/${x}/${y}" | grep -aq georef_id; then
    pass "martin-picc/candidates tiles carry the details keys"
else
    fail "martin-picc/candidates tiles carry the details keys"
fi
martin_down
