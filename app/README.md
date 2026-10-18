# BE2OSM web app

A Nuxt 4 single-page app (`ssr: false`) with its API as Nitro server routes, served from one container. The map
uses [OpenLayers](https://openlayers.org/), the UI uses Tailwind v4 and shadcn-vue-style components
(`components/ui/`, built on radix-vue). Dev tooling is [Vite+](https://viteplus.dev) (`vp`), which bundles Vitest,
Oxlint and Oxfmt.

## Commands

```bash
npm install                 # also runs `nuxt prepare`
npm run dev                 # http://localhost:3000
npm run build
npm test                    # unit tests
npm run test:coverage       # with the coverage thresholds CI enforces
npx vp test run tests/overpass.test.ts     # one file
npx vp test run -t "name of test"          # one test
npm run lint                # type-aware oxlint (0 errors required)
npm run typecheck           # vue-tsc -b
npx vp fmt                  # format
```

`npm run dev` alone has no source data: tiles come through Caddy (`/tiles/...`), and the API needs PostgreSQL.
The [README](../README.md#getting-started) shows how to run against the test stack's database.

Configuration comes from environment variables (`nuxt.config.ts`): `POSTGRES_HOST/PORT/USER/PASSWORD`,
`JWT_SECRET`, `OSM_CLIENT_ID`, `OSM_CLIENT_SECRET`, `OSM_REDIRECT_URI`, and `GIT_SHA` (baked in by CI, reported
by readiness).

## Layout

| Path                                                                       | What                                                                                                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/index.vue`                                                          | the only page: navigation bar and the map                                                                                                                  |
| `components/InteractiveMap.vue`                                            | most of the app (about 2700 lines): the OpenLayers map, a vector tile layer per source, selection, the difference request, the info panel, the JOSM export |
| `components/`                                                              | navigation, search, login dialog, match mode control, JOSM help, info panel, toasts                                                                        |
| `components/ui/`                                                           | UI primitives (buttons, dialogs, tabs, ...)                                                                                                                |
| `composables/useMapLayers.ts`                                              | base layers: OSM Belgium, the Flanders, Wallonia and Brussels orthophotos, Esri imagery                                                                    |
| `composables/useJosmExport.ts`                                             | candidates → OSM XML → `/api/export/upload` → JOSM remote control (`127.0.0.1:8111`)                                                                       |
| `composables/useAuth.ts`, `useSearch.ts`, `useMatchMode.ts`, `useToast.ts` | OSM login state, Nominatim search, the match mode setting, notifications                                                                                   |
| `utils/candidates.ts`                                                      | the candidates contract on the app side: columns, views, tile URLs, `candidateTags` (OSM tags per source)                                                  |
| `utils/grbExportTags.ts`                                                   | GRB building types and KNW default tags ([docs/GRB_PROPERTY_MAPPINGS.md](../docs/GRB_PROPERTY_MAPPINGS.md))                                                |
| `utils/geojsonToOsm.ts`                                                    | GeoJSON → OSM XML                                                                                                                                          |
| `utils/osmSourceOidn.ts`                                                   | parsing the GRB references of OSM buildings (`source:geometry:ref`, the older `:oidn` tags)                                                                |
| `utils/matchMode.ts`, `utils/openlayers.ts`                                | match mode rules, OpenLayers helpers                                                                                                                       |
| `plugins/chunk-reload.client.ts`                                           | reloads the page once when a deploy made the old JS chunks disappear                                                                                       |

### Server routes (`server/`)

| Route                                            | What                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/buildings/difference`                 | the candidates in view with no OSM match. Body: `bounds` (EPSG:3857), `dataSource` (`grb`, `knw`, `picc`, `urbis`), `matchMode` (`geometry`, `source`, `both`), `geometryThreshold` (0.3–0.95), `useOverpass`, `contract` |
| `POST /api/buildings/osm-live`                   | OSM buildings in view from Overpass ("Live OSM data")                                                                                                                                                                     |
| `POST /api/export/upload`, `GET /exports/<file>` | stores an OSM XML export for an hour, so JOSM can load it by URL                                                                                                                                                          |
| `/api/auth/*`                                    | OSM OAuth 2.0 login; the session is a JWT cookie                                                                                                                                                                          |
| `GET /api/meta/data-dates`                       | when each source was last imported                                                                                                                                                                                        |
| `GET /api/health`, `GET /api/health/ready`       | liveness; readiness for deploys (commit, migrations, candidates views)                                                                                                                                                    |
| `GET /api/proxy/brussels-wms`                    | proxy for the UrbIS WMS (tile size and projection fixes)                                                                                                                                                                  |

`server/utils/db.ts` has two pools: `queryGrb` (database `be2osm`) and `queryOsm` (`osmbe`).
`server/utils/overpass.ts` is the Overpass client; keep its descriptive `User-Agent`, because public instances
answer HTTP 406 to generic clients.

## Tests

- `tests/` holds the unit tests. They run without the Nuxt runtime: auto-imports and Nitro globals are stubbed
  with `vi.stubGlobal` before the module under test is imported (`tests/server/nitro.ts`), and the database is
  mocked with `vi.mock('~/server/utils/db')`. Import the test APIs from `vite-plus/test`.
- Coverage counts `utils/`, `server/` and `composables/`, not components. Keep logic out of `.vue` files.
- `tests/integration/` runs against a real database. The repository's `tests/db/run.sh 70` runs it, and it is
  skipped unless `TEST_PG_PORT` is set. Its snapshots record the difference responses and JOSM exports per source.

## Type checking notes

- TypeScript is strict with `noUncheckedIndexedAccess`, pinned to 6.x (vue-tsc doesn't support 7).
- `vue-tsc -b` checks `.vue` files; `vp lint` runs the type-aware rules and skips them.
- Both scripts run `nuxt prepare` first. After a `nuxt build`, a bare `vp lint` or `vue-tsc` reports spurious
  "Cannot find name 'defineEventHandler'" errors.
- Tests are compiled with `tsconfig.test.json`, which is deliberately not named `tsconfig.json`.
