# Contributing

Every push and pull request runs CI (`.github/workflows/ci.yml`): the app checks, the infrastructure checks and the
database suite. A push to `main` deploys itself once all three pass, so `main` must always be releasable.

## Before you push

App (from `app/`):

```bash
npx vp fmt               # formats (single quotes, no semicolons, no trailing commas, 120 columns)
npm run typecheck        # vue-tsc, .vue files included
npm run lint             # type-aware oxlint: 0 errors
npm run test:coverage    # unit tests; fails below 95% lines/functions/statements, 90% branches
npm run build
```

Database, imports, tiles and API (from the repository root, needs Docker, python3, curl and node):

```bash
tests/db/run.sh            # every case (a few minutes; PostGIS runs under amd64 emulation on Apple Silicon)
tests/db/run.sh 30 60      # only the cases whose file name starts with 30 or 60
KEEP=1 tests/db/run.sh 70  # leave the stack running to inspect it (PostGIS on localhost:55432)
SKIP_BUILD=1 tests/db/run.sh   # reuse the processing and webhook images built by a previous run
```

Shell scripts and workflows (what the CI infra job runs):

```bash
docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:v0.10.0 -S warning -s bash \
  webhook/*.sh tests/db/*.sh tests/db/cases/*.sh scripts/*.sh processing/sql/migrate.sh processing/scripts/*.sh
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -no-color
```

## The test suites

**Unit tests** (`app/tests/`, Vitest through [Vite+](https://viteplus.dev)) run without the Nuxt runtime. Import
test APIs from `vite-plus/test`. Server routes are tested with the h3/Nitro globals stubbed (`tests/server/nitro.ts`)
and the database mocked (`vi.mock('~/server/utils/db')`). Coverage counts `utils/`, `server/` and `composables/`,
not Vue components: put logic in those modules, not in components.

**The database suite** (`tests/db/`) runs the real thing on small fixtures. `docker-compose.test.yml` mirrors
production: the same PostGIS image and init scripts, the processing image running the real `just` recipes, the
four Martin servers with the real configs, and the webhook. Each case in `tests/db/cases/` starts from a clean
database:

| Cases | What they check |
|---|---|
| `05`, `06` | the webhook job server and the CI script that waits for jobs |
| `10`–`25` | migrations: a fresh database, the runner (checksums, locks, `--deploy`), the candidates contract, upgrades from old schemas |
| `30`–`55` | every import, update and restore recipe per source, on fixtures; imports must not change the schema |
| `60` | every Martin config starts and serves a tile per source |
| `70` | the API integration tests (`app/tests/integration/`), with recorded snapshots of the difference responses and JOSM exports |
| `80`, `85` | `webhook/deploy.sh` scenarios (rollback included) and the bootstrap's helpers |
| `90` | the previous release (its Martin configs and API tests) still works on this release's schema |

Fixtures are small GeoJSON/CSV/SQL files in `tests/fixtures/`. `tests/fixtures/build.sh` turns them into what the
recipes read (shapefiles, DBF, FileGDB, GeoPackage).

Snapshots in `app/tests/integration/__snapshots__/` change only on purpose: run
`npx vp test run tests/integration -u` with the stack running (`KEEP=1 tests/db/run.sh 70`, then
`TEST_PG_PORT=55432` from `app/`). When you change one, list it in `tests/db/previous-release-snapshots.txt`
so case 90 expects the new output from the previous release too, and empty that list in the next commit.

## Changing the database

Tables and views come only from versioned migrations: `processing/sql/migrations/<scope>/NNN_name.sql`,
scopes `common`, `grb`, `picc`, `urbis`. They are applied by `just db-migrate` on every import, deploy and
bootstrap. The `postgres/` init scripts only run on a new volume and only create extensions and schemas.

- **Never edit a migration that has been applied.** The runner records checksums and stops on a mismatch. Add a
  new file.
- **Expand, then contract.** A deploy migrates first and, if the new app fails, rolls back the code but not the
  schema. So the previous release must work on the new schema (case 90 checks it). To rename or remove something:
  add the new thing in one commit, switch the readers, and drop the old thing in a later commit.
- **Migrations run online**, on the live 5-million-row GRB table while tiles and the API read it: constant
  defaults, `NOT VALID` then `VALIDATE`, batched updates, `CREATE INDEX CONCURRENTLY` (with
  `-- migrate:no-transaction`), views built next to the old one and swapped by rename. Mark a long one
  `-- migrate:heavy`: automatic deploys refuse it, and it is run by hand ([docs/RUNBOOK.md](docs/RUNBOOK.md)).
- **Imports must not change the schema.** ogr2ogr only appends to migration-owned tables or writes `_raw` tables
  that the recipe drops. The import cases compare schema dumps before and after.
- **A new candidate column** goes into all four candidates views and the four Martin `candidates` sources (and
  `CANDIDATE_COLUMNS` in `app/utils/candidates.ts`). Case 16 checks that the views stay identical.
- Don't add mounts to the `postgres` service in `docker-compose.yml`: changing its definition makes
  `docker compose run processing` recreate the database container on the server.

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains why it works this way.

## Conventions

- TypeScript is strict, with `noUncheckedIndexedAccess`: guard indexed access instead of using `!`.
  TypeScript stays on 6.x (vue-tsc doesn't support 7).
- Code comments cite GitHub issues as `Issue #53`. [UX_PLAN.md](UX_PLAN.md) is the UX improvement plan.
- Martin configs: keep `connection_string` unquoted, use the `cache:` section, and write no dollar sign in
  comments. Newer Martin versions silently stop substituting the environment variables otherwise (case 60 catches it).
- Overpass requests keep their descriptive `User-Agent`: public instances reject generic clients.
