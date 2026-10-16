# Helpers for tests/db/cases/*.sh (sourced by run.sh; every case runs in its own bash process).
# Every command goes through `docker compose`, so no local psql/ogr2ogr is needed.

ROOT="${ROOT:?run through tests/db/run.sh}"
COMPOSE=(docker compose --progress quiet -f "$ROOT/docker-compose.test.yml")

# Base databases created by run.sh, cloned into be2osm by reset_db.
#   fresh  : production init scripts only (what a new volume gets, before migrations)
#   v7088  : the GRB schema of commit 7088df9 (before migration 001), plus the current PICC/Urbis schemas
CASE_FAILURES=0

log() { printf '    %s\n' "$*"; }

fail() {
    printf '    \033[31mFAIL\033[0m %s\n' "$*"
    CASE_FAILURES=$((CASE_FAILURES + 1))
}

pass() { printf '    \033[32mok\033[0m   %s\n' "$*"; }

# psql in the postgres container. Usage: psql_db [-d db] <psql args...>; reads stdin when given -f -.
psql_db() {
    local db=be2osm
    if [ "${1:-}" = "-d" ]; then
        db="$2"
        shift 2
    fi
    "${COMPOSE[@]}" exec -T postgres psql -U be2osm -d "$db" -X -q -tA -v ON_ERROR_STOP=1 "$@"
}

# Value of one SQL query (trimmed). Usage: sql [-d db] "SELECT ..."
sql() {
    if [ "${1:-}" = "-d" ]; then
        psql_db -d "$2" -c "$3"
    else
        psql_db -c "$1"
    fi
}

# Run a SQL file from the repository (path relative to ROOT).
sql_file() {
    psql_db -f - <"$ROOT/$1"
}

# Recreate be2osm (and osmbe for "fresh") from a base database.
reset_db() {
    local base="${1:?reset_db fresh|v7088}"
    psql_db -d postgres -c "DROP DATABASE IF EXISTS be2osm WITH (FORCE)" >/dev/null
    psql_db -d postgres -c "CREATE DATABASE be2osm TEMPLATE be2osm_${base}" >/dev/null
}

# Run a just recipe in the processing container, like production does.
just_run() {
    "${COMPOSE[@]}" run --rm -T processing just "$@"
}

# Build the fixture files for one source into the processing data volume.
fixtures() {
    "${COMPOSE[@]}" run --rm -T --entrypoint bash processing /fixtures/build.sh "$1" >/dev/null
}

assert_eq() { # <actual> <expected> <message>
    if [ "$1" = "$2" ]; then
        pass "$3"
    else
        fail "$3 (expected '$2', got '$1')"
    fi
}

assert_true() { # <sql returning a boolean> <message>
    local got
    got=$(sql "$1" 2>&1) || true
    assert_eq "$got" "t" "$2"
}

assert_fails() { # <message> <command...>: the command must exit non-zero
    local msg="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        fail "$msg (command succeeded)"
    else
        pass "$msg"
    fi
}

# Start the Martin tile servers (production configs) and wait until each answers /health.
martin_up() {
    "${COMPOSE[@]}" --profile martin up -d --force-recreate "$@" >/dev/null 2>&1
    local svc port
    for svc in "$@"; do
        port=$(martin_port "$svc")
        for _ in $(seq 1 60); do
            curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1 && break
            sleep 1
        done
    done
}

martin_down() {
    "${COMPOSE[@]}" --profile martin rm -sf martin-grb martin-osm martin-picc martin-urbis >/dev/null 2>&1 || true
}

martin_port() {
    case "$1" in
    martin-grb) echo "${TEST_MARTIN_GRB_PORT:-53001}" ;;
    martin-osm) echo "${TEST_MARTIN_OSM_PORT:-53002}" ;;
    martin-picc) echo "${TEST_MARTIN_PICC_PORT:-53003}" ;;
    martin-urbis) echo "${TEST_MARTIN_URBIS_PORT:-53004}" ;;
    esac
}

martin_logs() {
    "${COMPOSE[@]}" --profile martin logs --no-color "$1" 2>&1
}

# z/x/y of the tile containing lon/lat at zoom z
tile_xyz() { # <lon> <lat> <z>
    python3 -c "import math,sys; lon,lat,z=float(sys.argv[1]),float(sys.argv[2]),int(sys.argv[3]); n=2**z; print(z, int((lon+180)/360*n), int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n))" "$@"
}
