#!/usr/bin/env python3
# Regenerates tag-passthrough.osm.pbf, used by tests/db/cases/36-osm-import-tags.sh to check that the real
# imposm3 mapping (processing/config/imposm-mapping.yml) keeps source:geometry:ref and source:geometry:date on
# buildings. imposm3 only reads PBF (no plain .osm XML), and the processing image has no OSM XML->PBF
# converter, so the fixture is committed as a binary; regenerate it with `pip install osmium` and this script
# if it ever needs to change.
import os

import osmium

OUTPUT = "tag-passthrough.osm.pbf"
# SimpleWriter refuses to overwrite an existing file (and older pyosmium versions don't even support an
# overwrite argument), but this fixture is committed, so regenerating it must replace it in place.
if os.path.exists(OUTPUT):
    os.remove(OUTPUT)

writer = osmium.SimpleWriter(OUTPUT)

nodes = [
    (1, 4.4200, 51.2000),
    (2, 4.4201, 51.2000),
    (3, 4.4201, 51.200065),
    (4, 4.4200, 51.200065),
]
for node_id, lon, lat in nodes:
    writer.add_node(osmium.osm.mutable.Node(id=node_id, location=(lon, lat), tags={}))

writer.add_way(
    osmium.osm.mutable.Way(
        id=9001,
        nodes=[1, 2, 3, 4, 1],
        tags={
            "building": "yes",
            "source:geometry:ref": "Gbg/1002",
            "source:geometry:date": "2012-08-08",
        },
    )
)
writer.close()
