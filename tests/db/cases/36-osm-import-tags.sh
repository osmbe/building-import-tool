#!/usr/bin/env bash
# Imposm3 only caches OSM tags referenced in a table's mapping/columns (even for hstore_tags columns meant
# to capture "all tags"): the real osm-import recipe must run against config/imposm-mapping.yml, not a
# hand-rolled INSERT, to catch a tag silently missing from the config (as source:geometry:ref/:date were,
# see tests/fixtures/osm/tag-passthrough.osm.pbf and the Source match mode in server/api/buildings/difference).
reset_db fresh
"${COMPOSE[@]}" run --rm -T --entrypoint bash processing -c \
  "mkdir -p /work/data/osm && cp /fixtures/osm/tag-passthrough.osm.pbf /work/data/osm/tag-passthrough.osm.pbf" >/dev/null
"${COMPOSE[@]}" run --rm -T -e OSM_FILE=data/osm/tag-passthrough.osm.pbf -e CACHE_DIR=data/osm/tag-passthrough-cache \
  processing just osm-import >/dev/null

assert_eq "$(sql -d osmbe "SELECT tags->>'source:geometry:ref' FROM osm.osm_buildings WHERE osm_id = 9001")" "Gbg/1002" \
  "source:geometry:ref survives the real imposm mapping (not just a hand-written fixture row)"
assert_eq "$(sql -d osmbe "SELECT tags->>'source:geometry:date' FROM osm.osm_buildings WHERE osm_id = 9001")" "2012-08-08" \
  "source:geometry:date survives the real imposm mapping too"
assert_eq "$(sql -d osmbe "SELECT tags->>'building' FROM osm.osm_buildings WHERE osm_id = 9001")" "yes" \
  "ordinary tags still come through (sanity check for the two assertions above)"
