# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BE2OSM: a web tool for importing official Belgian building data into OpenStreetMap. It shows regional datasets (GRB for Flanders, PICC for Wallonia, Urbis for Brussels) next to existing OSM buildings, works out which buildings are missing or outdated, and exports selected buildings to JOSM. Urbis is implemented in the code, even though README.md still calls it "planned".

## Commands

### Frontend (`app/`, Nuxt 4 SPA)

```bash
cd app
npm install                 # runs `nuxt prepare` via postinstall
npm run dev                 # http://0.0.0.0:3000
npm run build
npm test                    # vp test run (unit tests in app/tests/)
npm run test:coverage       # with v8 coverage + thresholds (report in app/coverage/)
npx vp test run tests/overpass.test.ts      # single test file
npx vp test run -t "name of test"           # single test by name
npm run lint                # nuxt prepare && vp lint (type-aware oxlint, must pass with 0 errors)
npm run fmt                 # vp fmt (oxfmt)
npm run typecheck           # nuxt prepare && vue-tsc -b --noEmit (nuxt typeCheck is disabled)
```

Dev tooling is [Vite+](https://viteplus.dev) (`vite-plus`). It bundles Vitest, Oxlint and Oxfmt, so those aren't direct dependencies; import test APIs from `vite-plus/test`, not `vitest`. Test, lint and fmt config all live in `app/vite.config.ts`. Nuxt does not read that file and logs a harmless `NUXT_B5004` warning about it in dev. The app build is configured in `nuxt.config.ts`. A `package.json` override aliases `vite` to `@voidzero-dev/vite-plus-core`, so Nuxt also builds on the Vite+ core.

The codebase is formatted with `vp fmt` (single quotes, no semicolons, no trailing commas, 120 columns). Run it before committing.

TypeScript runs in strict mode (`typescript.strict: true` in `nuxt.config.ts`), and Nuxt's preset also enables `noUncheckedIndexedAccess`. Guard indexed access (`arr[i]`, regex matches, `split()` results) rather than reaching for `!`.

TypeScript is pinned to 6.x: vue-tsc doesn't work with TypeScript 7, the native port, because 7 lacks the JS compiler API vue-tsc needs.

Type checking is split across two tools. `vue-tsc -b` checks everything including `.vue` files; the root `tsconfig.json` only holds project references, so the `-b` flag is required. `vp lint` runs type-aware rules plus a type check through tsgolint, which skips `.vue` files. Both scripts run `nuxt prepare` first because `nuxt build` rewrites `.nuxt/tsconfig.server.json` with a Nitro types path that its own `exclude` hides. After a build, running bare `vp lint` or `vue-tsc` reports spurious "Cannot find name 'defineEventHandler'" errors.

Tests run without the Nuxt runtime. The test transform uses `app/tsconfig.test.json`, so it doesn't depend on the generated `.nuxt/tsconfig`. That file is deliberately not named `tsconfig.json` and not placed in `tests/`, so type-aware lint still checks the tests against Nuxt's project config. Nuxt/Nitro auto-imports are stubbed with `vi.stubGlobal` before the module under test is imported dynamically: `tests/server/nitro.ts` covers the h3/Nitro globals (`defineEventHandler`, `readBody`, `createError`, …) for server routes, and the composable tests stub `$fetch`, `useState` and friends. The database is mocked with `vi.mock('~/server/utils/db')`.

Coverage (`npm run test:coverage`) covers `utils/`, `server/` and `composables/`, with thresholds of 95% for lines, statements and functions and 90% for branches; the run fails below them. Vue components are excluded, so keep logic in those modules rather than in components.

### Data processing (`processing/justfile`)

Every import task is a `just` recipe. Run it inside the processing container, which has ogr2ogr, imposm3, psql and jq:

```bash
docker compose run --rm processing just --list
docker compose run --rm processing just grb-full      # order → wait → download → import
docker compose run --rm processing just grb-update    # differential update
docker compose run --rm processing just osm-import | osm-update
docker compose run --rm processing just picc-full | picc-update
docker compose run --rm processing just urbis-full | urbis-update
docker compose run --rm processing just db-shell-grb  # psql into be2osm
```

The `processing` service sits behind a compose profile. Processing tasks read the **root** `.env` file; `processing/` has no `.env` of its own. GRB tasks need `DIGITAL_VLAANDEREN_API_KEY`.

### Database, import, Martin and API integration tests (`tests/db/`)

```bash
tests/db/run.sh            # every case in tests/db/cases/ (about 2 min; needs Docker, python3, curl, node)
tests/db/run.sh 30 60      # only cases whose file name starts with 30 or 60
KEEP=1 tests/db/run.sh 70  # leave the test stack running to inspect it
```

`docker-compose.test.yml` mirrors production: the same PostGIS image and `postgres/0*.sql` init scripts, the processing image running real `just` recipes (justfile and `sql/` mounted read-only, throwaway data volume), and the four Martin servers with the real `config/martin/*.yaml`. On Apple Silicon PostGIS runs under amd64 emulation.

- Each case (`tests/db/cases/NN-*.sh`, helpers in `tests/db/lib.sh`) starts from a clean `be2osm` cloned from a base database: `fresh` (init scripts only) or `v7088` (the GRB schema before migration 001, `tests/db/schemas/`), for upgrade tests.
- Fixtures live in `tests/fixtures/{grb,picc,urbis,osm}` as small GeoJSON/CSV/SQL files. `tests/fixtures/build.sh` turns them into the formats the recipes read (shapefiles + DBF relation files, a FileGDB, a GeoPackage). Feature ids are top-level GeoJSON `id` members.
- The webhook image runs in the suite too, with the scripts mounted from the checkout and a fake `gh` (`tests/db/bin/gh`) that serves artifacts the cases write: `05` runs the `webhook/test_server.py` unit tests, `06` the CI polling script, `35` the GRB restores (published `grb_next` dumps; refused, broken and legacy data-only dumps), `80` `webhook/deploy.sh` scenarios (`tests/db/deploy-test.sh`: a local bare git origin, a fake docker CLI and readiness endpoint in `tests/db/bin/deploy/`).
- `25-upgrade-production.sh` migrates the production schema snapshot (`tests/db/schemas/be2osm-production.sql`, written by the bootstrap); it is skipped until that file is committed. `85-bootstrap.sh` covers the bootstrap's helpers.
- `90-previous-release.sh` (expand before contract), with `tests/db/previous-release-snapshots.txt` listing the API snapshots a commit changes on purpose (the previous release must then produce the new expected output) and, as `skip-test: <name>`, previous-release tests to skip for an assertion changed on purpose; empty the list in the next commit: the previous release's Martin configs and API integration tests, with its own fixtures and snapshots, against a database migrated and imported by the current code. CI checks out the parent commit (or a PR's base) as `PREVIOUS_DIR`; locally use `PREVIOUS_REF=HEAD~1 tests/db/run.sh 90`. Skipped without either.
- `15-migrate-runner.sh` covers the migration runner: tracking, checksums, the `--deploy` guard, the advisory lock and lock-timeout retries.
- `60-martin.sh` starts every Martin config against imported fixtures and checks health, published properties and a tile per source. Martin upgrades have silently broken the configs before (see Serving).
- `70-api.sh` runs `app/tests/integration/*.int.test.ts` (vitest, skipped unless `TEST_PG_PORT` is set) against the fixtures. Its `__snapshots__/` record the difference API responses and the JOSM export per source; update them only on purpose (`npx vp test run tests/integration -u` with the stack running).

CI (`.github/workflows/ci.yml`) runs the app checks, an infra job (actionlint, shellcheck `-S warning`, justfile parsing, compose validation) and this suite on every push and pull request; on `main`, images are built and the deploy webhook is called only when all of them pass.

### Full stack

```bash
cp .env.example .env
docker compose up -d        # postgres, nuxt-app, 4× martin, webhook, caddy
```

`caddy` attaches to the external network `nginx-proxy-network` (production TLS sits in Nginx Proxy Manager upstream). Create that network before running the full stack locally.

## Architecture

### Two databases on one PostGIS instance

- **`be2osm`**: official data, one schema per source: `grb`, `picc`, `urbis`. Each source has a `*.buildings_with_addresses` materialized view that aggregates addresses per building. Martin and the difference API both read these views.
- **GRB** tables, indexes, triggers and summary views belong to migrations too (`grb/000_baseline`, then `001`–`003`); `postgres/02-setup-be2osm.sql` only creates the extensions and the schema. The trigger functions live in `public`, so a schema restored as `grb_next` finds them; they only set `updated_at` (`grb/005`). Each object's geometry is stored once, in EPSG:4326, plus the 3857 serving copy in the materialized view: the Web Mercator copies and the building union are gone (`grb/005` stopped writing them, `grb/006` dropped them; `30-grb-import.sh` checks the columns). `grb.kunstwerken.geom_mercator` stays, because the KNW views and tile sources read it. The import never changes the schema (`30-grb-import.sh` compares schema dumps): ogr2ogr only appends to migration-owned tables or writes `*_raw` tables it drops. The RltGbgGebouw relation (`grb.polygon_building_rel`) is emptied once `gebouw_id` is set, and the address links of the addresses download are not imported (addresses are joined by geometry, docs/GRB_ADDRESS_JOIN.md). `10-fresh-init.sh` checks that a fresh database and an old one (7088df9) migrated to the head have the same GRB catalog: a CI import (built fresh) is swapped in on the server (migrated), so both must match.
- **PICC** tables and view belong to migrations (`picc/001`, `002`): `picc.buildings` (stable unique `fid`: the objectid, plus n·1e10 when a province download repeats it; `date_leve` is a date; geometry in EPSG:31370) and `picc.addresses` (`street`, `house_number`, `postcode`, `municipality`). Every import path (full download, CI provinces, ArcGIS updates) loads the files into `picc._raw_*` tables with ogr2ogr and calls `picc.load_raw()`, the one mapping from the source formats (ICAR and ADRESS_POINT addresses) to these tables. An import never changes the schema (`40-picc-import.sh` compares schema dumps).
- **Urbis** works the same way (`urbis/001`): `urbis.buildings` (`building_id` = the Urbis inspire_id) and `urbis.addresses` (streets and municipalities resolved through the PlaceNames/Municipalities layers by `urbis.load_raw()`, so the lookup layers are not kept).
- **The candidates contract** (`grb/004_candidates`, `picc/003`, `urbis/002`): `grb.candidates`, `grb.knw_candidates`, `picc.candidates` and `urbis.candidates` are plain views over the materialized views (KNW: over `grb.kunstwerken`) with exactly the same columns, types and order: `fid` (unique, stable), `source`, `entity`, `source_id`, `source_ref` (the `source:geometry:ref` value, GRB/KNW only), `type_code`, `type_label`, `survey_date` (text, YYYY-MM-DD), `origin_label`, `area_m2`, `parent_*` (the GRB building, the Urbis block), the address lists and `address_count`, `details` (jsonb, source-specific extras; tiles carry each key as a property of its own, so keys must not clash with the contract columns) and `geom` (3857). `16-candidates-contract.sh` checks the shape and the contents per source. A new column goes into all four views and the four Martin `candidates` sources. A migration that rebuilds a materialized view with `DROP ... CASCADE` drops its candidates view too and must recreate it.
- **Publishing a CI import** (GRB, PICC and Urbis): the workflow renames the schema to `<schema>_next` before `pg_dump`; `processing/scripts/publish-schema.sh` restores it next to the live schema, checks it (row count at least 90% of live unless `FORCE=1`; its `schema_migrations` must equal this checkout's migrations), swaps the two schemas in one transaction and drops the old one. A failed or refused restore leaves the live data untouched. The GRB check counts `building_polygons`, so a KNW-only import (`products=knw`) is refused. Data-only GRB dumps of the workflow before the publish path are refused (they hold columns the schema no longer has).
- **`osmbe`**: OSM buildings imported by imposm3 into `osm.osm_buildings` / `osm.osm_addresses`. `processing/sql/transforms/transform-imposm-to-schema.sql` turns the raw imposm tables into this schema.
- **postgres_fdw** (`postgres/04-setup-fdw.sql`) exposes `osmbe.osm.*` inside `be2osm` as foreign tables. The FDW user mapping **hardcodes the password `be2osm`**: if `POSTGRES_PASSWORD` changes, update that file to match.

The init scripts `postgres/0*.sql` run only on the **first** container init (`docker-entrypoint-initdb.d`); for `be2osm` they only create extensions and schemas (plus the FDW in `04`). Every table and view comes from versioned migrations, `processing/sql/migrations/<scope>/NNN_name.sql`, applied by `processing/sql/migrate.sh` (`just db-migrate`):
- Scopes run in order `common`, `grb`, `picc`, `urbis`. Applied versions and file checksums are recorded in `<scope>.schema_migrations` (`public.schema_migrations` for `common`), so the tracking travels with the schema. Never edit an applied migration (the checksum check stops the run); add a new one.
- A file runs in one transaction unless it has a `-- migrate:no-transaction` line (needed for `CREATE INDEX CONCURRENTLY` or committed batches); such a file must be safe to re-run after a failure. `-- migrate:heavy` marks a migration that runs long on production data: `db-migrate --deploy` (automatic deploys) refuses to start it, so it is run by hand first (docs/RUNBOOK.md). `--status` lists applied and pending migrations.
- Migrations must work online on the live 5M-row GRB table while tiles and the API read it: constant-default columns, `NOT VALID` then `VALIDATE`, batched updates, concurrent indexes, and views built next to the old one then swapped by rename (see `grb/001`–`003`). Every run takes one advisory lock and a short `lock_timeout`, retried, so DDL never queues behind long readers.
- Expand before contract: the previous release (app image and Martin configs) must keep working on the migrated schema, because deploys migrate first and roll back the code, never the schema.
- `just db-migrate` is called by every import and update recipe, the GRB view refresh, deploys and the bootstrap.
- Don't add init-script mounts to the `postgres` service: changing its definition makes `docker compose run processing` recreate postgres on the server. Fresh volumes get the migrations by running `just db-migrate` once after init.
- `grb/003_buildings_with_addresses_entity.sql` is the single source of truth for `grb.buildings_with_addresses`.

### Serving

Caddy (`caddy/Caddyfile`) is the single entry point:
- `/tiles/{grb,osm,picc,urbis}/*` → four Martin vector-tile servers, one per source. Each has its own config in `config/martin/*.yaml`, and that config fixes the table/view, the columns exposed as tile properties, and the zoom range. When you add a property to a tile layer, update both the view and the Martin config. Each config serves only the source's `candidates` (the contract; GRB also `knw_candidates`); `60-martin.sh` checks the catalogs hold nothing else.
- `/webhook/*` → `webhook/server.py`
- everything else → Nuxt

Martin config rules (Martin ≥ 1.12 changed its YAML parser; `60-martin.sh` guards these):
- `connection_string` must stay an **unquoted** YAML scalar, or the `${POSTGRES_*}` variables are not substituted.
- Use the `cache:` section. If the legacy top-level cache size key name appears anywhere in the file, even in a comment, Martin skips variable substitution for the whole file.
- No dollar signs in comments: older Martin versions substitute inside comments too.

The frontend fetches tiles from relative `/tiles/...` URLs. Nuxt has no dev proxy configured, so `npm run dev` on its own won't load tiles; they only work behind Caddy.

### Nuxt app (`app/`)

- `ssr: false`. The whole app is a client-side SPA plus Nitro server routes. `@` and `~` both alias the `app/` root.
- **`components/InteractiveMap.vue` (~2700 lines)** holds most of the app: the OpenLayers map, the vector tile layers for every source, selection, and calls to the difference API. Base layers live in `composables/useMapLayers.ts`.
- **`server/api/buildings/difference.post.ts`** is the core comparison endpoint. It takes `bounds`, `dataSource` (`grb|knw|picc|urbis`), `matchMode` (`geometry|source|both`), `geometryThreshold` (0.3–0.95), `useOverpass` and `contract` (must equal `CANDIDATES_CONTRACT` in `utils/candidates.ts`: a page loaded before a contract change gets a 409 asking to reload, so it never exports properties it doesn't know). It returns the official buildings with no OSM match as features with the contract properties, from one query on the source's candidates view (`CANDIDATE_VIEWS`); geometry matching runs in EPSG:3857 for every source. `source` and `both` modes match on the GRB references in OSM `source:geometry:ref`/`source:geometry:oidn` tags and only work for GRB. GBG and GBA OIDNs are only unique per entity, so references are compared as `Entity/oidn` keys (`utils/osmSourceOidn.ts`) against `source_ref`. The GRB building-type allow-list (issue #53) applies to GRB only. `stats.totalGrb` comes from a separate count query, so it stays correct when there are no candidates. The endpoint needs a migrated database (the candidates views); it has no fallbacks for older schemas.
- `server/utils/db.ts` has two `pg` pools: `queryGrb` (be2osm) and `queryOsm` (osmbe).
- `server/utils/overpass.ts`: an opt-in "Live OSM data" mode that fetches OSM buildings (ways and multipolygon relations) from Overpass instead of the Postgres mirror, for the difference and the map layer (`/api/buildings/osm-live`). Public Overpass instances reject generic clients with HTTP 406, so keep the descriptive `User-Agent` (`OVERPASS_USER_AGENT` overrides it).
- `server/api/health/ready.get.ts`: readiness for deploys: the build's git SHA (`runtimeConfig.gitSha`), database reachability and the applied migrations per scope. It answers 503 while one of the `CANDIDATE_VIEWS` is missing, so a deploy whose migrations did not create them rolls back.
- `server/api/meta/data-dates.get.ts`: when each source was last imported, read from the one-row `<schema>.import_meta` tables that the processing recipes write.
- **JOSM export**: `candidateTags` in `utils/candidates.ts` builds the OSM tags of a candidate per source (GRB rules and KNW defaults from `utils/grbExportTags.ts`) and `utils/geojsonToOsm.ts` builds the OSM XML. `composables/useJosmExport.ts` POSTs the XML to `/api/export/upload` (written to `public/exports/`, deleted after 1h, served by `server/routes/exports/[filename].get.ts`). It then calls JOSM remote control (`127.0.0.1:8111` `/load_data`), passing that URL. `docs/GRB_PROPERTY_MAPPINGS.md` documents the tag-mapping rules.
- Auth: OSM OAuth 2.0 in `server/api/auth/*`, with a JWT cookie signed using `JWT_SECRET`.
- The map panels read the contract properties too: tile layers use the Martin `candidates` sources (`candidateTileUrl`), and `candidateDetail` reads a source-specific extra from `details` (API) or from the feature itself (tiles, where `ST_AsMVT` writes each `details` key as a property).
- `components/ui/*` are shadcn-vue-style primitives built on radix-vue. Styling is Tailwind v4 through `@tailwindcss/vite`.

### Data pipeline and deployment

- **Webhook** (`webhook/server.py`): every POST route starts a job and answers 202 with a `job_id`; `GET /jobs/<id>` returns its status and the end of its log; `GET /health` needs no secret. Jobs run one at a time under a global `flock` in the `webhook-state` volume, which also keeps job records across webhook restarts. The image (built by CI) only holds the server and the tools; the job scripts run from the mounted checkout, so they always match the deployed commit. Workflows start jobs with `.github/scripts/webhook-job.sh`, which waits for the result and fails the step when the job fails.
- **CI imports** (`.github/workflows/*-import.yml`) run the heavy full imports on GitHub runners. Each one starts a throwaway PostGIS service, runs the needed `postgres/*.sql` init script and then the `just` recipe inside the processing image, and uploads a dump artifact. It then starts the `<source>-restore` job, and `webhook/restore-*.sh` downloads the artifact with `gh`. GRB, PICC and Urbis dump their schema renamed to `<schema>_next`; the restore checks the free disk, publishes it with `publish-schema.sh` (see above), then recreates the source's tile server so Martin's tile cache drops the old data.
- **Updates** (`*-update.yml`) start the `update-<source>` job, which runs `docker compose run --rm --no-deps processing just <source>-update` through the mounted Docker socket. The OSM (daily) and Urbis (monthly: a full re-download, replaced in one transaction) crons run; the GRB and PICC ones are paused (manual dispatch only) until a manual run has confirmed the real update formats. `picc-update` fetches the changes since `picc.import_meta` from the ArcGIS REST service and replaces the buildings and addresses with the same objectids (`picc.load_raw(..., replace => true)`) in one transaction. `grb-update` applies the difference download (a delete and an add file per entity, recognised by name) with `processing/sql/updates/grb-apply-diff.sql` in one transaction, starting from the date in `grb.import_meta`; `32-grb-update-diff.sh` tests it on fixture diffs.
- **Deploy** (`ci.yml`, on push to main, after every CI job passes): builds and pushes the `nuxt-app`, `processing` and `webhook` images to GHCR (tags `latest`, `main-<short sha>`, `sha-<full sha>`; the app image gets the commit as `GIT_SHA`). With the repository variable `DEPLOY_V2=true` it then runs the `deploy` job, `webhook/deploy.sh <sha>`: preflight (no image overrides in `.env`, free disk, database up, clean checkout), git reset of the server checkout, `sha-` images tagged `:deployed` (compose uses those tags), `db-migrate --deploy`, recreation of the Martin servers and Caddy whose config changed, nuxt-app, a wait for `/api/health/ready` to report the commit (rollback of checkout and image tags otherwise), and last the webhook itself from a detached helper. Without `DEPLOY_V2` (server not bootstrapped yet, see docs/RUNBOOK.md) the job deploys nothing and only warns: the app needs the candidates views and Martin sources, so updating nuxt-app alone (the old `/nuxt-deploy` route) would break the server.
- Every webhook route except `/health` requires the `X-Webhook-Secret` header.

## Other docs

- `INSTALL.md`: production server setup
- `docs/RUNBOOK.md`: deploys, the one-time server bootstrap (`scripts/server-bootstrap.sh`), heavy migrations, rollbacks, job logs
- `processing/README.md`, `processing/DOCKER.md`: processing details
- `docs/GRB_ADDRESS_JOIN.md`: how GRB addresses are linked to buildings
- `ISSUES_PLAN.md`, `UX_PLAN.md`: working plans for open GitHub issues (code comments cite issue numbers like `Issue #53`)
