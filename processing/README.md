# Processing: imports, updates and migrations

Everything that downloads, imports or changes data is a [`just`](https://github.com/casey/just) recipe in
`justfile`. The recipes call standard tools: ogr2ogr (GDAL) for GRB, PICC and Urbis, imposm3 for OSM, and psql
for SQL. There is no custom processing code. The tools come in this folder's Docker image, which CI builds and
publishes as `ghcr.io/osmbe/building-import-tool/processing`.

## Running recipes

Run them from the repository root, in the `processing` service of `docker-compose.yml`. It connects to the
`postgres` service and reads the **root** `.env`; there is no `.env` in this folder.

```bash
docker compose run --rm processing just --list         # every recipe, with its description
docker compose run --rm processing just grb-status
docker compose run --rm processing just db-shell-grb   # psql into be2osm (db-shell-osm: osmbe)
docker compose run --rm processing bash                # a shell with every tool
```

Downloads go to `processing/data/` (git-ignored) and logs to `processing/logs/`. The GRB recipes need
`DIGITAL_VLAANDEREN_API_KEY`. The `*-remote` recipes need `gh` authenticated on the host, because `~/.config/gh`
is mounted into the container.

To build the image yourself: `docker compose build processing`. imposm3 is built from source on arm64.

## Recipes by source

| Source | Full import | Update | Status |
|---|---|---|---|
| GRB + KNW | `grb-full` (order, wait, download, import) or `grb-import` on downloaded files; `grb-import-remote` runs it on GitHub Actions | `grb-update` | `grb-status`, `grb-status-orders` |
| PICC | `picc-full` (download, import); `picc-province-import <PROVINCE>` for one province; `picc-import-remote` | `picc-update` | `picc-status` |
| Urbis | `urbis-full` (download, import) | `urbis-update` | `urbis-status` |
| OSM | `osm-download` then `osm-import`; `osm-import-remote` | `osm-update` | `osm-status` |
| all | | | `db-sizes`, `db-migrate --status` |

On the server these run as webhook jobs started by GitHub Actions (see [docs/RUNBOOK.md](../docs/RUNBOOK.md)), not
by hand.

### GRB (Flanders)

GRB comes from the Digitaal Vlaanderen download API (reference: `docs/swagger-download-api-v2.json`). Products are
ordered, prepared by the API (minutes to hours), then downloaded as shapefiles in Lambert 72:

| Product | Content |
|---|---|
| GBG | building polygons and `RltGbgGebouw*.dbf` (polygon → building registry id) |
| GBA | building attachments (floors, stairs, canopies, ...) |
| KNW | structures (bridges, chimneys, silos, ...) |
| Addresses | address points. The `RltAdresGebouw*.dbf` link files in the same download are not imported: addresses are joined by geometry ([GRB_ADDRESS_JOIN.md](../docs/GRB_ADDRESS_JOIN.md)) |

`grb-import`:
1. `db-migrate`;
2. load the RltGbgGebouw relation;
3. import the GBG, GBA and KNW polygons (`entity` = `Gbg`/`Gba`, survey dates converted) and set `gebouw_id`;
4. import the addresses;
5. aggregate `grb.buildings` per `gebouw_id`;
6. refresh `grb.buildings_with_addresses`;
7. record the time in `grb.import_meta`.

`grb-update` orders the difference since that date. That is a delete file and an add file per entity, applied in
one transaction by `sql/updates/grb-apply-diff.sql`.

### PICC (Wallonia)

`picc-download` resolves the current FileGDB (buildings) and ICAR shapefile (addresses) URLs from the MetaWal
GeoNetwork metadata. The import loads them into `picc._raw_*` tables and calls `picc.load_raw()`, which maps
both address formats into `picc.buildings` and `picc.addresses` in one transaction. The view is then refreshed
concurrently, so tiles keep the previous data until the end.

The CI import (`picc-import.yml`) runs one job per province (`picc-province-load`) and merges their raw dumps with
`picc-finalize-provinces`. `picc-update` fetches the objects changed since the last import from the ArcGIS REST
service (filtered on `DATE_MODIF`) and replaces them.

### Urbis (Brussels)

`urbis-download` fetches the UrbIS vector GeoPackage (about 350 MB, Lambert 72). `urbis.load_raw()` resolves
street and municipality names through its lookup layers. There is no differential API: `urbis-update` downloads
everything again and replaces the data in one transaction.

### OSM

`osm-download` gets the Geofabrik extract (`OSM_REGION`, default `europe/belgium`). `osm-import` runs imposm3 with
`config/imposm-mapping.yml` (buildings with all their tags, and address points) and
`sql/transforms/transform-imposm-to-schema.sql` (into `osm.osm_buildings` / `osm.osm_addresses` of `osmbe`).
`osm-update` applies the daily Geofabrik diffs and needs the imposm cache of the last import.

## Schema and migrations

Recipes never create tables. Every table and view comes from `sql/migrations/<scope>/NNN_name.sql`, applied by
`just db-migrate` (`sql/migrate.sh`), which every import and update runs first. An import never changes the
schema; the database suite checks that by comparing schema dumps. The rules for writing migrations are in
[CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-database), and how it all fits together in
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

`scripts/publish-schema.sh <schema>` publishes a CI import: it restores the `<schema>_next` dump next to the live
schema, checks it, and swaps the two in one transaction.

## Folder layout

```
processing/
├── Dockerfile              # GDAL, imposm3, psql, just, jq
├── justfile                # every recipe
├── config/                 # imposm3 config and mapping
├── scripts/publish-schema.sh
└── sql/
    ├── migrate.sh          # the migration runner
    ├── migrations/         # common/, grb/, picc/, urbis/
    ├── transforms/         # imposm tables → osm schema
    └── updates/            # GRB difference download
```

## Resources

A full Belgium dataset needs about 50 GB of disk for downloads, the imposm cache and the databases, and at least
4 GB of RAM for the imports. GRB is the largest source (about 5 million polygons). The full imports run on GitHub
runners for that reason; the server only restores their dumps.
