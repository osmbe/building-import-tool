# Server runbook

How the production server (`/opt/docker/buildings`) is updated, and what to do when something goes wrong.
The moving parts:

- **CI** (`.github/workflows/ci.yml`) tests every push, builds the `nuxt-app`, `processing` and `webhook` images
  (tagged `sha-<commit>`) and, on main, asks the server to deploy that commit.
- **The webhook** (`webhook/server.py`, container `be2osm-webhook`) runs deploys, restores of CI import artifacts
  and updates one at a time, keeping a record and log of each. Manual full imports are in `scripts/import/`.
- **Migrations** (`processing/sql/migrations/<scope>/NNN_*.sql`, `just db-migrate`) change the database schema.

## One-time bootstrap

The step-by-step checklist for the server admin is [FIX_CD.md](../FIX_CD.md).

Until the bootstrap is done, CI deploys nothing: the deploy job only warns. (It used to update `nuxt-app` alone
through the old `/nuxt-deploy` route, but the app now needs the migrations and the Martin `candidates` sources.)
The server keeps running the release it has. **Don't run the GRB Import
workflow before the bootstrap:** the old restore script empties the GRB tables and cannot load the new dump
(a `grb_next` schema), so GRB would stay empty.

1. Wait until CI is green on main (the bootstrap pulls the images built for the head of main).
2. Check the token in `.env`: `GH_TOKEN` must be able to read the private repository, its Actions artifacts and its
   packages. With a classic token that means the `repo` and `read:packages` scopes. Step 1 of the script shows
   the scopes, so you can run `--report` first.
3. On the server:

   ```bash
   cd /opt/docker/buildings
   tmux new -s bootstrap
   # The checkout is older than the script: fetch it from main with the token in .env
   curl -fsSL -H "Authorization: token $(sed -n 's/^GH_TOKEN=//p' .env)" -o /tmp/server-bootstrap.sh \
     https://raw.githubusercontent.com/osmbe/building-import-tool/main/scripts/server-bootstrap.sh
   bash /tmp/server-bootstrap.sh --report     # changes nothing: disk, sizes, containers, token scopes
   bash /tmp/server-bootstrap.sh              # add --backup to keep a pg_dump of the grb schema
   ```

   The script is idempotent (after the first run, `bash scripts/server-bootstrap.sh` works too), so run it again if anything stops it (an SSH drop, too little disk, CI not done yet).
   What it does:
   - reset the checkout to main, saving local changes as a patch in `~/be2osm-bootstrap/`;
   - remove `NUXT_IMAGE`/`PROCESSING_IMAGE`/`WEBHOOK_IMAGE` from `.env`, and pin `COMPOSE_PROJECT_NAME`
     and `COMPOSE_PROJECT_DIR`. A backup of `.env` goes into `~/be2osm-bootstrap/`;
   - pull the images and tag them `:deployed`;
   - recreate the webhook;
   - run every migration, including the heavy GRB view rebuild. That takes about 30 minutes, and the old view
     keeps serving tiles meanwhile;
   - recreate the Martin servers, Caddy and the app;
   - check readiness, every tile server and one difference request.
4. When the summary says everything answers:
   - Optionally set `APP_URL` (e.g. `https://buildings.osm.be`) for the public readiness check after each deploy.
   - Commit `~/be2osm-bootstrap/be2osm-production-schema.sql` as `tests/db/schemas/be2osm-production.sql`.
     `tests/db/cases/25-upgrade-production.sh` then tests every migration against the real production schema.
   - Run the **GRB Import** workflow. The new import keeps the GBA polygons that share an OIDN with a GBG polygon.

A **new server** follows INSTALL.md up to `.env`, starts only the database (`docker compose up -d postgres`)
and then runs the bootstrap the same way. On an empty database the migrations are instant.

## Deploys

Every push to main deploys itself once CI is green, through `webhook/deploy.sh <sha>`:

1. **Preflight**, which fails fast without changing anything when:
   - `.env` overrides an image;
   - the disk has less than `DEPLOY_MIN_FREE_GB` (default 5) free;
   - the database is down;
   - the checkout has local changes.
2. **Fetch** main, and check the commit is on it.
3. **Images:** pull the `sha-<commit>` images and tag them `:deployed`. The previous ones are kept as `:previous`.
4. **Checkout:** `git reset --hard` to the commit, as the owner of the checkout.
5. **Migrations:** `just db-migrate --deploy`.
6. **Martin and Caddy:** recreate the servers whose config file (or `docker-compose.yml`) changed.
7. **App:** recreate `nuxt-app`, then wait for `/api/health/ready` to report the commit.
8. **Webhook:** if its image or the compose file changed, a detached helper recreates it a few seconds after
   the job ends.

If step 5 or 7 fails, the checkout and the image tags go back to the previous release, the services recreated in
step 6 are recreated again, and the deploy fails. Migrations are not rolled back. They are written "expand before
contract", so the previous release works on the migrated schema.

The CI deploy job shows the end of the deploy log. On the server, the job records are in the `webhook-state`
volume:

```bash
docker exec be2osm-webhook ls -t /state/jobs | head          # most recent jobs (<id>.json + <id>.log)
docker exec be2osm-webhook cat /state/jobs/<id>.log
curl -s -H "X-Webhook-Secret: $WEBHOOK_SECRET" https://<host>/webhook/jobs/<id>   # status + log tail
```

**Roll back by hand:** deploy an older commit of main, whose images are still in GHCR:

```bash
curl -X POST -H "X-Webhook-Secret: $WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"sha": "<older commit>"}' https://<host>/webhook/deploy
```

**"busy":** jobs run one at a time. A deploy waits up to 45 minutes for a running restore or import, then gives
up with the status `busy`. Re-run the failed CI deploy job once the other job has finished.

## Heavy migrations

A migration marked `-- migrate:heavy` (for example a materialized view rebuild) is never started by a deploy: the
deploy fails with "heavy migration ... is not applied yet" and keeps the previous release running. Run it by hand
on the server, in tmux, then re-run the CI deploy job:

```bash
cd /opt/docker/buildings
git fetch && git checkout <commit>     # the commit that adds the migration
docker compose run --rm -T --no-deps processing just db-migrate --status
docker compose run --rm -T --no-deps processing just db-migrate
git checkout main                      # leave the checkout clean for the next deploy
```

Heavy migrations build their new objects next to the old ones and swap them in, so tiles and the API keep
working meanwhile. They need free disk for the copy: check `just db-sizes` first.

## Restores, imports and updates

- **CI imports** (`GRB Import`, `PICC Import`, `UrbIS Import`, `OSM Import`) end by starting the
  `<source>-restore` job. The workflow waits for it and fails when the restore fails.
- **Updates:** the OSM update runs daily and the UrbIS update monthly. The GRB and PICC update crons stay paused
  until a manual run (Actions → GRB Update / PICC Update → Run workflow) has confirmed that the real difference
  files / ArcGIS fields are read correctly: check the job log for the removed/changed/added counts, then add the
  `schedule:` back in the workflow.
- **GRB, PICC and UrbIS restores** load the dump as `<schema>_next` next to the live data, check it and swap it in
  (`processing/scripts/publish-schema.sh`), then recreate the source's tile server. Tiles and the difference API
  keep serving the previous data until the swap. A refused or failed restore leaves the live data as it was; the
  job log says why:
  - "MB free, about ... MB needed": the restore needs about 1.3× the live schema plus 5× the dump, plus 2 GB. Free
    disk (`docker builder prune -af`, `docker image prune -f`) and start the restore job again.
  - "built with other migrations": deploy first, then run the import workflow again.
  - "fewer than 90%": if the drop is real, restore by hand with `FORCE=1`:
    `docker exec -e FORCE=1 be2osm-webhook bash /opt/docker/buildings/webhook/restore-<source>.sh <run_id> osmbe/building-import-tool`
    (when no other job is running).
  - "has no building_polygons": a GRB import of selected products (for example only `knw`) never replaces the whole
    GRB schema. Run the full import.
- The full GRB restore takes about an hour: the dump rebuilds every index and the view inside `grb_next`.
- A GRB artifact of the workflow before the publish path (a data-only dump) is refused ("not a dump of grb_next"):
  run the GRB Import workflow again.
- **Stale tiles:** Martin caches tiles in memory (512 MB, 1 h). Restores recreate the source's tile server; after an
  update or a change by hand, recreate it to see the new data right away:
  `docker compose up -d --no-deps --force-recreate grb-tiles`.

## Troubleshooting

| Symptom | Check |
|---|---|
| Deploy fails in preflight | The message says which check failed. For local changes: `git -C /opt/docker/buildings status` (commit them upstream, then `git checkout -- .`). |
| Deploy fails on readiness | `docker logs be2osm-nuxt`; `docker exec be2osm-webhook curl -s http://nuxt-app:3000/api/health/ready`. The release was rolled back. |
| Image pull fails | Is the CI images job green for that commit? Can `GH_TOKEN` read packages? Try `docker login ghcr.io` on the server. |
| A migration fails | `docker compose run --rm -T --no-deps processing just db-migrate --status`, then run it by hand to see the error. A `no-transaction` migration can be re-run once the cause is fixed. |
| "different checksum" | An applied migration file was edited. Restore its original content and add a new migration instead. |
| Tile server down after a deploy | `docker logs be2osm-grb-tiles`. Martin config rules: CLAUDE.md, Serving. |
| Webhook not answering | `docker logs be2osm-webhook`; `docker compose up -d --no-deps webhook`. Jobs it was running are marked `interrupted`. |
