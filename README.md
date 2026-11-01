# BE2OSM

BE2OSM helps OpenStreetMap contributors import official Belgian building data. It covers all three regions:

| Region | Dataset | Provider |
|---|---|---|
| Flanders | [GRB](https://www.vlaanderen.be/digitaal-vlaanderen/onze-oplossingen/basiskaart-vlaanderen-grb) buildings (GBG, GBA) and structures (KNW, *kunstwerken*) | Digitaal Vlaanderen |
| Wallonia | [PICC](https://geoportail.wallonie.be/catalogue/b795de68-726c-4bdf-a62a-a42686aa5b6f) buildings and ICAR addresses | Service Public de Wallonie |
| Brussels | [UrbIS](https://datastore.brussels/web/urbis) buildings and addresses | paradigm.brussels |

The web app shows a region's official buildings next to the existing OSM buildings and finds the official buildings
that have no match in OSM. A contributor picks the ones to import and opens them in
[JOSM](https://josm.openstreetmap.de/), already tagged (`building=yes`, addresses, `source:geometry:*`), to review
and upload. Users sign in with their OSM account.

Production runs at <https://new.buildings.osm.be>. `buildings.osm.be` still serves the previous tool until the switch
described in [INSTALL.md](INSTALL.md).

## How it works

```
                       ┌──────────────── one server, docker compose ────────────────┐
 browser ── HTTPS ──▶  │ Caddy ─┬─ /tiles/{grb,osm,picc,urbis}/* ─▶ 4× Martin ─┐    │
                       │        ├─ /webhook/*  ─▶ webhook (jobs) ─┐            │    │
                       │        └─ everything else ─▶ Nuxt app ───┼────────────┤    │
                       │                                          ▼            ▼    │
                       │                      processing (just) ─▶ PostgreSQL + PostGIS
                       └──────────────────────────────────────────▲─────────────────┘
 GitHub Actions: CI, image builds, deploys, heavy imports ────────┘ (through the webhook)
```

- **PostgreSQL + PostGIS** holds two databases. `be2osm` has one schema per official source (`grb`, `picc`,
  `urbis`); `osmbe` has the OSM buildings of Belgium (`osm`).
- **Processing** (`processing/`) is a container with GDAL/ogr2ogr, imposm3 and psql. Every task is a
  [`just`](https://github.com/casey/just) recipe: download, import, update, migrate. There is no custom ETL code,
  only the recipes and SQL.
- **Martin** serves each source as vector tiles. **The Nuxt app** draws them with OpenLayers and has a small API
  (Nitro server routes): the difference between a source and OSM in the current view, the JOSM export, OSM login.
- **The webhook** runs the server-side jobs (deploys, restores of CI imports, updates) one at a time, started by
  GitHub Actions.

### The candidates contract

Each source has its own columns, ids and address formats. Each one is exposed through the same view shape, the
**candidates**: `grb.candidates`, `grb.knw_candidates`, `picc.candidates` and `urbis.candidates` share these
columns, with the same types and order: `fid`, `source`, `entity`, `source_id`, `source_ref`, `type_code`,
`type_label`, `survey_date`, `area_m2`, the parent building, the addresses, `details` (source-specific extras as
jsonb; GRB carries the summarized `street`, `house_numbers` and `flats`) and `geom` (EPSG:3857). The tiles, the
difference API and the JOSM export only read these columns, so the app has no per-source column names. Adding a
source means writing its candidates view.

### Finding missing buildings

`POST /api/buildings/difference` takes the map view and a source. It returns the candidates in view that have no
OSM match:

- **geometry**: no OSM building overlaps the candidate by more than the threshold (30–95%);
- **source** (GRB only): no OSM building carries its reference in `source:geometry:ref` (`Gbg/123`);
- **both**: neither.

OSM buildings come from the `osmbe` mirror (updated daily), or live from Overpass when the user turns on
"Live OSM data".

### Keeping the data current

| Source | Full import | Updates |
|---|---|---|
| GRB + KNW | GitHub Actions (`grb-import.yml`), published on the server | difference downloads (`grb-update`, manual for now) |
| PICC | GitHub Actions, one job per province | ArcGIS REST changes since the last import (`picc-update`, manual for now) |
| UrbIS | GitHub Actions or on the server | monthly full re-download (cron) |
| OSM | GitHub Actions or on the server (imposm3) | daily Geofabrik diffs (cron) |

Full imports run on GitHub runners, not on the server. A workflow builds the source's schema in a throwaway
database and renames it `<schema>_next` in the dump. The server restores it next to the live schema, checks it,
and swaps the two in one transaction, so tiles and the API never see half-imported data. A failed import leaves
the live data untouched.

## Repository map

| Path | What |
|---|---|
| [`app/`](app/README.md) | Nuxt 4 SPA and its server API (TypeScript, OpenLayers, Tailwind, shadcn-vue) |
| [`processing/`](processing/README.md) | processing image, the justfile, SQL migrations, transforms and updates |
| `config/martin/` | one Martin config per tile server |
| `caddy/Caddyfile` | routing |
| `webhook/` | job server (`server.py`) and the job scripts: deploy, restore, import, update |
| `postgres/` | init scripts of a new database volume (extensions and schemas only) |
| `scripts/server-bootstrap.sh` | one-time switch of an existing server to the current deploy process |
| `tests/` | database, import, tile and API integration suite (`tests/db/`), fixtures |
| `.github/workflows/` | CI and deploy (`ci.yml`), imports and updates per source |
| `docs/` | runbook, tag mappings, design notes, API references of Digitaal Vlaanderen |

## Getting started

You need Node 24 (the version CI uses) and Docker. The app on its own:

```bash
cd app
npm install
npm run dev            # http://localhost:3000
```

On its own the dev server shows the map, base layers and OSM login, but no source data: tiles are only served
behind Caddy, and the API needs a database. For a database with real (small) data, start the test stack and keep
it running:

```bash
KEEP=1 tests/db/run.sh 70     # imports the fixtures of every source; PostGIS on localhost:55432
cd app && POSTGRES_PORT=55432 POSTGRES_USER=be2osm POSTGRES_PASSWORD=be2osm npm run dev
```

The difference API then answers for the fixture areas. The test stack is described in
[CONTRIBUTING.md](CONTRIBUTING.md).

The full stack (`docker compose up -d`) is the production setup: see [INSTALL.md](INSTALL.md). Real imports
need a lot of disk and time (GRB: about 5 million polygons), and GRB needs an API key from Digitaal Vlaanderen.

## Documentation

- [CONTRIBUTING.md](CONTRIBUTING.md): checks to run, tests, conventions, how to change the schema
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): data model, migrations, the import and publish flow, deploys
- [app/README.md](app/README.md): the web app
- [processing/README.md](processing/README.md): imports, updates and recipes
- [FIX_CD.md](FIX_CD.md): the one-time server upgrade that turns automatic deploys back on
- [INSTALL.md](INSTALL.md): setting up a server
- [docs/RUNBOOK.md](docs/RUNBOOK.md): operating the server: deploys, bootstrap, heavy migrations, rollbacks
- [docs/GRB_PROPERTY_MAPPINGS.md](docs/GRB_PROPERTY_MAPPINGS.md): which OSM tags the JOSM export writes
- [docs/GRB_ADDRESS_JOIN.md](docs/GRB_ADDRESS_JOIN.md): why GRB addresses are joined by geometry
- [UX_PLAN.md](UX_PLAN.md): the UX improvement plan for mappers

## License and data

The repository has no license file yet. Each dataset has its own licence and attribution terms: check them, and
the [OSM import guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines), before uploading.
