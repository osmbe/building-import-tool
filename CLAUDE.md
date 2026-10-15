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

### Full stack

```bash
cp .env.example .env
docker compose up -d        # postgres, nuxt-app, 4× martin, webhook, caddy
```

`caddy` attaches to the external network `nginx-proxy-network` (production TLS sits in Nginx Proxy Manager upstream). Create that network before running the full stack locally.

## Architecture

### Two databases on one PostGIS instance

- **`be2osm`**: official data, one schema per source: `grb`, `picc`, `urbis`. Each source has a `*.buildings_with_addresses` materialized view that aggregates addresses per building. Martin and the difference API both read these views.
- **`osmbe`**: OSM buildings imported by imposm3 into `osm.osm_buildings` / `osm.osm_addresses`. `processing/sql/transforms/transform-imposm-to-schema.sql` turns the raw imposm tables into this schema.
- **postgres_fdw** (`postgres/04-setup-fdw.sql`) exposes `osmbe.osm.*` inside `be2osm` as foreign tables. The FDW user mapping **hardcodes the password `be2osm`**: if `POSTGRES_PASSWORD` changes, update that file to match.

The schemas come from `postgres/0*.sql`, which run only on the **first** container init (`docker-entrypoint-initdb.d`). Editing these files does nothing to an existing volume. Schema changes for existing databases go in `processing/sql/migrations/NNN-*.sql`:
- Every migration must be idempotent. They are applied in order by `just db-migrate` (also called by `grb-import`, `grb-update` and the GRB view refresh) and by `webhook/restore-grb.sh` before a data-only dump is restored, because the dump COPYs columns of the current schema.
- Mount new migrations in `docker-compose.yml` as `docker-entrypoint-initdb.d/07-...` so fresh volumes get them too.
- `001-grb-polygon-entity.sql` is the single source of truth for `grb.buildings_with_addresses`.

### Serving

Caddy (`caddy/Caddyfile`) is the single entry point:
- `/tiles/{grb,osm,picc,urbis}/*` → four Martin vector-tile servers, one per source. Each has its own config in `config/martin/*.yaml`, and that config fixes the table/view, the columns exposed as tile properties, and the zoom range. When you add a property to a tile layer, update both the matview and the Martin config.
- `/webhook/*` → `webhook/server.py`
- everything else → Nuxt

The frontend fetches tiles from relative `/tiles/...` URLs. Nuxt has no dev proxy configured, so `npm run dev` on its own won't load tiles; they only work behind Caddy.

### Nuxt app (`app/`)

- `ssr: false`. The whole app is a client-side SPA plus Nitro server routes. `@` and `~` both alias the `app/` root.
- **`components/InteractiveMap.vue` (~2700 lines)** holds most of the app: the OpenLayers map, the vector tile layers for every source, selection, and calls to the difference API. Base layers live in `composables/useMapLayers.ts`.
- **`server/api/buildings/difference.post.ts`** is the core comparison endpoint. It takes `bounds`, `dataSource` (`grb|knw|picc|urbis`), `matchMode` (`geometry|source|both`), `geometryThreshold` (0.3–0.95) and `useOverpass`. It returns official buildings that have no OSM match. `source` and `both` modes match on the GRB references in OSM `source:geometry:ref`/`source:geometry:oidn` tags and only work for GRB. GBG and GBA OIDNs are only unique per entity, so references are compared as `Entity/oidn` keys (`utils/osmSourceOidn.ts`). The polygon's entity is `grb.building_polygons.entity`; on unmigrated databases it is derived from the type label (`grbEntityForTypeLabel` in `utils/grbExportTags.ts`). The GRB tile feature id is `polygon_id`, not `oidn`, since a GBG and a GBA polygon can share an OIDN. `stats.totalGrb` comes from a separate count query, so it stays correct when there are no candidates. The endpoint checks the schema at runtime (legacy vs normalized GRB column names, and whether the matview exists), so it keeps working against older deployments. Keep that tolerance.
- `server/utils/db.ts` has two `pg` pools: `queryGrb` (be2osm) and `queryOsm` (osmbe).
- `server/utils/overpass.ts`: an opt-in "Live OSM data" mode that fetches OSM buildings (ways and multipolygon relations) from Overpass instead of the Postgres mirror, for the difference and the map layer (`/api/buildings/osm-live`). Public Overpass instances reject generic clients with HTTP 406, so keep the descriptive `User-Agent` (`OVERPASS_USER_AGENT` overrides it).
- `server/api/meta/data-dates.get.ts`: when each source was last imported, read from the one-row `<schema>.import_meta` tables that the processing recipes write.
- **JOSM export**: `utils/grbExportTags.ts` and `utils/geojsonToOsm.ts` map source properties to OSM tags and build OSM XML. `composables/useJosmExport.ts` POSTs the XML to `/api/export/upload` (written to `public/exports/`, deleted after 1h, served by `server/routes/exports/[filename].get.ts`). It then calls JOSM remote control (`127.0.0.1:8111` `/load_data`), passing that URL. `docs/GRB_PROPERTY_MAPPINGS.md` documents the tag-mapping rules.
- Auth: OSM OAuth 2.0 in `server/api/auth/*`, with a JWT cookie signed using `JWT_SECRET`.
- `components/ui/*` are shadcn-vue-style primitives built on radix-vue. Styling is Tailwind v4 through `@tailwindcss/vite`.

### Data pipeline and deployment

- **CI imports** (`.github/workflows/*-import.yml`) run the heavy full imports on GitHub runners. Each one starts a throwaway PostGIS service, runs the needed `postgres/*.sql` init script and then the `just` recipe inside the processing image, and uploads a `pg_dump --data-only` artifact. It then POSTs `/<source>-restore` with `run_id` to the server webhook. `webhook/restore-*.sh` downloads the artifact with `gh`, TRUNCATEs the source tables and restores the dump.
- **Updates** (`*-update.yml`, cron) just POST `/update-<source>` to the webhook. The server then runs `docker compose run --rm processing just <source>-update` locally through the mounted Docker socket.
- **Deploy** (`deploy.yml`, on push to main): builds and pushes `nuxt-app` and `processing` images to GHCR, then POSTs `/nuxt-deploy`, which pulls and recreates `nuxt-app`.
- Every webhook route requires the `X-Webhook-Secret` header.

## Other docs

- `INSTALL.md`: production server setup
- `processing/README.md`, `processing/DOCKER.md`: processing details
- `docs/GRB_ADDRESS_JOIN.md`: how GRB addresses are linked to buildings
- `ISSUES_PLAN.md`, `UX_PLAN.md`: working plans for open GitHub issues (code comments cite issue numbers like `Issue #53`)
