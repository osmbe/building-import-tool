# Expand before contract: the previous release (its Martin configs and its API, with its own fixtures and
# snapshots) must keep working on a database migrated and imported by this release, because deploys migrate
# first and keep the schema when they roll back.
#
#   PREVIOUS_DIR=<checkout with app/node_modules> tests/db/run.sh 90      (CI)
#   PREVIOUS_REF=HEAD~1 tests/db/run.sh 90                                 (checks it out in tests/.previous-release)
if [ -z "${PREVIOUS_DIR:-}" ] && [ -n "${PREVIOUS_REF:-}" ]; then
    PREVIOUS_DIR="$ROOT/tests/.previous-release"
    git -C "$ROOT" worktree remove --force "$PREVIOUS_DIR" >/dev/null 2>&1 || rm -rf "$PREVIOUS_DIR"
    git -C "$ROOT" worktree add --detach "$PREVIOUS_DIR" "$PREVIOUS_REF" >/dev/null 2>&1
    (cd "$PREVIOUS_DIR/app" && npm ci --silent >/dev/null 2>&1)
fi
if [ -z "${PREVIOUS_DIR:-}" ]; then
    log "skipped: set PREVIOUS_DIR or PREVIOUS_REF to the previous release"
    return 0
fi
log "previous release: $(git -C "$PREVIOUS_DIR" log -1 --format='%h %s')"

# This release's migrations and import recipes, the previous release's fixtures
reset_db fresh
export FIXTURES_DIR="$PREVIOUS_DIR/tests/fixtures"
for src in grb picc urbis; do fixtures "$src"; done
just_run db-migrate >/dev/null
just_run grb-import >/dev/null 2>&1
just_run picc-import >/dev/null 2>&1
just_run urbis-import >/dev/null 2>&1
psql_db -d osmbe -c "TRUNCATE osm.osm_buildings" >/dev/null
psql_db -d osmbe -f - <"$PREVIOUS_DIR/tests/fixtures/osm/buildings.sql" >/dev/null

# The previous release's Martin configs: every server starts and serves its sources
export MARTIN_CONFIG_DIR="$PREVIOUS_DIR/config/martin"
martin_up martin-grb martin-osm martin-picc martin-urbis
for svc in martin-grb martin-osm martin-picc martin-urbis; do
    port=$(martin_port "$svc")
    if catalog=$(curl -fsS "http://127.0.0.1:${port}/catalog" 2>/dev/null) && [ "$catalog" != '{"tiles":{}}' ]; then
        pass "$svc (previous config) serves its catalog"
    else
        fail "$svc (previous config) does not serve its catalog"
        martin_logs "$svc" | tail -5 | sed 's/^/      /'
    fi
    for src in $(python3 -c "import json,sys; print(' '.join(json.loads(sys.argv[1]).get('tiles', {})))" "${catalog:-{\}}" 2>/dev/null); do
        read -r z x y < <(tile_xyz 4.4 51.2 14)
        code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${port}/${src}/${z}/${x}/${y}")
        case "$code" in 200 | 204) pass "$svc/$src (previous config) answers tiles" ;; *) fail "$svc/$src (previous config): HTTP $code" ;; esac
    done
    if martin_logs "$svc" | grep -q ' ERROR '; then fail "$svc (previous config) logged errors"; fi
done
martin_down
unset MARTIN_CONFIG_DIR

# The previous release's API integration tests and snapshots (minus the intentional changes listed in
# tests/db/previous-release-snapshots.txt, taken from the current tree)
if [ -d "$PREVIOUS_DIR/app/tests/integration" ]; then
    skip=()
    while read -r snapshot; do
        case "$snapshot" in "" | "#"*) continue ;; esac
        if [[ "$snapshot" == "skip-test: "* ]]; then
            skip+=("${snapshot#skip-test: }")
            log "intentional change: test \"${snapshot#skip-test: }\" skipped"
            continue
        fi
        cp "$ROOT/app/tests/integration/__snapshots__/$snapshot" "$PREVIOUS_DIR/app/tests/integration/__snapshots__/$snapshot"
        log "intentional change: $snapshot"
    done <"$ROOT/tests/db/previous-release-snapshots.txt"
    filter=()
    if [ "${#skip[@]}" -gt 0 ]; then
        # Every test whose name contains none of the skipped names (regular expression characters escaped)
        pattern=$(printf '%s\n' "${skip[@]}" | sed 's/[][\\.^$*+?(){}|]/\\&/g' | paste -sd'|' -)
        filter=(-t "^(?!.*(${pattern}))")
    fi
    if (cd "$PREVIOUS_DIR/app" && TEST_PG_PORT="${TEST_PG_PORT:-55432}" npx vp test run tests/integration ${filter[@]+"${filter[@]}"} >/tmp/previous-api.$$ 2>&1); then
        pass "the previous release's API integration tests pass"
    else
        fail "the previous release's API integration tests fail"
        tail -30 /tmp/previous-api.$$ | sed 's/^/      /'
    fi
    rm -f /tmp/previous-api.$$
else
    log "the previous release has no API integration tests"
fi
