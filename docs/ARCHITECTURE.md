# Architecture

How the data is stored, imported, served and deployed, and why. The README has the overview; this page is for
changing things.

## Data model

One PostGIS instance, two databases:

- **`be2osm`**: the official data, one schema per source. Each schema also has `schema_migrations` (the
  migrations applied to it) and `import_meta` (when it was last imported, read by `/api/meta/data-dates`).
- **`osmbe`**: the OSM buildings of Belgium, `osm.osm_buildings` and `osm.osm_addresses`, imported by imposm3 and
  reshaped by `processing/sql/transforms/transform-imposm-to-schema.sql`.

The app reads both through two connection pools (`app/server/utils/db.ts`); the two databases are not linked.

### GRB (Flanders)

| Object | Content |
|---|---|
| `grb.building_polygons` | GBG (*gebouw aan de grond*) and GBA (*gebouwaanhorigheid*: floors, stairs, canopies, ...) polygons, EPSG:4326. Unique on `(entity, oidn)`: GBG and GBA OIDNs are only unique per entity. |
| `grb.buildings` | per `gebouw_id` (the building registry id, from the RltGbgGebouw relation): polygon count, area and type |
| `grb.addresses` | address points |
| `grb.kunstwerken` | KNW structures (bridges, chimneys, silos, wind turbines, ...) |
| `grb.buildings_with_addresses` | materialized view: one row per polygon, its addresses (joined by geometry, see [GRB_ADDRESS_JOIN.md](GRB_ADDRESS_JOIN.md)), its parent building, geometry in EPSG:3857 |
| `grb.candidates`, `grb.knw_candidates` | the candidates contract (below) |

### PICC (Wallonia) and UrbIS (Brussels)

`picc.buildings` (EPSG:31370, `fid`: the objectid, made unique when a province download repeats it) and
`picc.addresses`, then `picc.buildings_with_addresses` and `picc.candidates`. UrbIS has the same layout:
`urbis.buildings` (`building_id` = the UrbIS inspire_id), `urbis.addresses`, the view and `urbis.candidates`.

Every load goes through raw tables: ogr2ogr writes the downloaded files into `<schema>._raw_*`, and one SQL function
(`picc.load_raw()`, `urbis.load_raw()`) maps them into the tables. That function is the only place that knows the
source formats (ICAR and ADRESS_POINT addresses for PICC; street and municipality lookups for UrbIS).

### The candidates contract

`grb.candidates`, `grb.knw_candidates`, `picc.candidates` and `urbis.candidates` are plain views with exactly the
same columns, types and order:

| Column | Meaning |
|---|---|
| `fid` | unique, stable id (the tile feature id) |
| `source` | `grb`, `knw`, `picc`, `urbis` |
| `entity`, `source_id`, `source_ref` | the source's own id; `source_ref` is the `source:geometry:ref` value (`Gbg/123`; GRB and KNW only) |
| `type_code`, `type_label` | the source's classification (GRB LBLTYPE, KNW type, PICC nature) |
| `survey_date`, `origin_label` | when and how the object was surveyed (`YYYY-MM-DD`) |
| `area_m2` | area in m² |
| `parent_id`, `parent_type_label`, `parent_part_count`, `parent_area_m2` | the GRB building or the UrbIS block it belongs to |
| `addresses`, `street_names`, `postcodes`, `municipalities`, `address_count` | the addresses inside it |
| `details` | jsonb, source-specific extras; tiles carry each key as a property |
| `geom` | EPSG:3857 |

Everything downstream reads only these columns:
- the Martin `candidates` sources;
- the difference API: one query on `CANDIDATE_VIEWS`;
- the tag mapping for JOSM: `candidateTags` in `app/utils/candidates.ts`, documented in
  [GRB_PROPERTY_MAPPINGS.md](GRB_PROPERTY_MAPPINGS.md);
- the map panels.

The app sends `contract: 1` with every difference request, and the API refuses any other value. A page loaded
before a contract change then asks the user to reload, instead of exporting properties it doesn't know.
`tests/db/cases/16-candidates-contract.sh` checks the shape and contents per source.

## Migrations

`processing/sql/migrate.sh` (`just db-migrate`) applies `processing/sql/migrations/<scope>/NNN_name.sql` in order:
first `common`, then `grb`, `picc`, `urbis`. Each scope records its versions and checksums in its own
`schema_migrations` table, so the tracking travels with the schema when schemas are swapped (below).

- One advisory lock covers the whole run, so a deploy, an import and a restore never migrate at the same time.
  `lock_timeout` is short and retried: DDL never queues behind long readers and blocks them.
- A file runs in one transaction, unless it has `-- migrate:no-transaction` (for `CREATE INDEX CONCURRENTLY` or
  committed batches).
- `-- migrate:heavy` marks a file that runs long on production data. `db-migrate --deploy` (automatic deploys)
  refuses to start it.
- `db-migrate --status` lists applied and pending migrations.

The rules for writing migrations are in [CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-database).

## Imports: build next to the live data, then swap

A full import never empties live tables. The GRB, PICC and UrbIS import workflows (`.github/workflows/*-import.yml`):

1. start a throwaway PostGIS on the GitHub runner and run the `just` recipe in the processing image;
2. rename the schema to `<schema>_next` and `pg_dump` it;
3. upload the dump as an artifact and start the `<source>-restore` job on the server through the webhook.

The restore (`webhook/restore-*.sh`, then `processing/scripts/publish-schema.sh`):

1. checks the free disk space;
2. restores `<schema>_next` next to the live schema;
3. checks it. It needs at least 90% of the live row count (unless `FORCE=1`), so a partial or KNW-only GRB
   import is refused. Its `schema_migrations` must equal the server's: an import built before a deploy is
   refused with "deploy first, then run the import again";
4. swaps the two schemas in one transaction (`ALTER SCHEMA ... RENAME`) and drops the old one;
5. recreates the source's Martin server, which empties its tile cache.

If anything fails, the live schema is untouched.

**Updates** change the live data in one transaction:
- `grb-update` applies the GRB difference download with `processing/sql/updates/grb-apply-diff.sql`;
- `picc-update` replaces the objects changed since `picc.import_meta`, fetched from the ArcGIS REST service;
- `urbis-update` downloads everything again and replaces it.

The materialized views are then refreshed `CONCURRENTLY`, so readers keep the old rows until the refresh ends.

## Serving

Caddy (`caddy/Caddyfile`) is the only entry point. TLS terminates upstream, in Nginx Proxy Manager.

- `/tiles/<source>/*` goes to that source's Martin server. Each server's config (`config/martin/*.yaml`) fixes the
  view, the properties and the zoom range (10–22); GRB, PICC and UrbIS serve only their `candidates` source(s).
- `/webhook/*` goes to the job server.
- Everything else goes to Nuxt.

The app is a client-side SPA (`ssr: false`); its API is Nitro server routes in the same container.

## Deploys

Every push to `main` deploys itself once CI is green:

1. CI builds the `nuxt-app`, `processing` and `webhook` images, tagged `sha-<commit>`.
2. CI starts the `deploy` job on the server's webhook.
3. The job runs `webhook/deploy.sh <sha>`:
   1. preflight: disk, database, a clean checkout, no image overrides in `.env`;
   2. `git reset` of the server checkout to the commit;
   3. pull the images and tag them `:deployed` (compose uses those tags);
   4. `db-migrate --deploy`;
   5. recreate the Martin servers and Caddy whose config changed, then the app;
   6. wait until `/api/health/ready` reports the new commit. Readiness also needs every candidates view. If the
      app doesn't become ready, the checkout and image tags are rolled back; the schema stays, which is why
      migrations expand before they contract.
4. The webhook recreates itself last, from a detached helper container.

The webhook runs jobs one at a time under a lock and keeps their logs (`GET /jobs/<id>`). Workflows wait for the
job and fail when it fails (`.github/scripts/webhook-job.sh`). The job scripts are read from the server checkout,
so they always match the deployed commit.
