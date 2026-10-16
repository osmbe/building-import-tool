# Fix CD: upgrade the server once, then deploys are automatic again

**For:** whoever has shell access to the production server (`/opt/docker/buildings`).
**Time:** about 45 minutes, mostly waiting. **Downtime:** none expected; the site keeps serving while it runs.

## Why this is needed

Until 16 October 2026, every push to `main` called the server's `/nuxt-deploy` webhook, which only replaced the
`nuxt-app` container. It never updated anything else on the server: the checkout (its `git pull` failed
silently), the Martin configs, the webhook scripts or the database schema.

The app now needs database migrations and new Martin configs that only a full deploy brings. Replacing just the
app would break the difference API and the map layers. So CI stopped deploying (commit `06d1906`). Production
keeps running commit `f1cd301`, which works, but it gets no updates.

The fix is a one-time script, `scripts/server-bootstrap.sh`. It switches the server to the new deploy process,
`webhook/deploy.sh`, which updates everything on each push: checkout, images, migrations, configs, app and
webhook. It checks the result and rolls back automatically if the new app doesn't come up.

## Before you start

- [ ] **CI is green on the latest commit of `main`**
  (<https://github.com/osmbe/building-import-tool/actions/workflows/ci.yml>). The script pulls the images CI built
  for that commit.
- [ ] **No import workflow is running** (Actions → GRB/PICC/Urbis/OSM Import). And don't start the GRB Import
  before the upgrade: the old restore script on the server empties the GRB tables and can't load the new dump
  format.
- [ ] **You can run `docker` on the server** (root, or a user in the `docker` group) and you are the owner of the
  checkout, or root.
- [ ] **`GH_TOKEN` in `/opt/docker/buildings/.env`** is a classic personal access token with the `repo` and
  `read:packages` scopes. It is used to fetch the private repo, pull the images from GHCR and download import
  artifacts. Step 2 below shows its scopes.
- [ ] **Free disk:** the GRB view is rebuilt next to the old one, so you need roughly twice its size plus 10 GB.
  The report in step 2 shows the sizes, and the script refuses to start the migrations without enough space.

## Steps

### 1. Open a session that survives an SSH drop

```bash
cd /opt/docker/buildings
tmux new -s bootstrap        # reattach later with: tmux attach -t bootstrap
```

### 2. Fetch the script and run the report (changes nothing)

The server checkout is older than the script, so download it from `main` with the token in `.env`:

```bash
curl -fsSL -H "Authorization: token $(sed -n 's/^GH_TOKEN=//p' .env)" -o /tmp/server-bootstrap.sh \
  https://raw.githubusercontent.com/osmbe/building-import-tool/main/scripts/server-bootstrap.sh
bash /tmp/server-bootstrap.sh --report
```

Check the output: free disk, database sizes, the running containers, and the token scopes (`repo` and
`read:packages` must be listed). It also saves a schema snapshot of production in `~/be2osm-bootstrap/`.

### 3. Run the upgrade

```bash
bash /tmp/server-bootstrap.sh            # add --backup to also keep a pg_dump of the grb schema (needs disk)
```

What it does, in order (each step prints what it found and did):

1. Waits until no webhook or processing job is running.
2. Resets the checkout to `main`. Local changes are saved as a patch in `~/be2osm-bootstrap/`.
3. Cleans `.env`: removes `NUXT_IMAGE`/`PROCESSING_IMAGE`/`WEBHOOK_IMAGE` overrides and pins
   `COMPOSE_PROJECT_NAME` and `COMPOSE_PROJECT_DIR`. A backup goes to `~/be2osm-bootstrap/`.
4. Pulls the `nuxt-app`, `processing` and `webhook` images of that commit, tags them `:deployed`, and recreates
   the webhook.
5. Applies every database migration. The GRB view rebuild takes about 30 minutes; the old view keeps serving
   tiles meanwhile.
6. Recreates the four Martin tile servers, the app and Caddy.
7. Verifies the result: the app reports the new commit, every tile server answers, and a GRB difference request
   works.

It is safe to run again. If it stops (SSH drop, not enough disk, CI not finished, a failed check), fix what the
message says and run the same command again: it resumes.

When it ends with **"Everything answers"**, go on. If it ends with **"Some checks failed"**, don't continue: see
[docs/RUNBOOK.md](docs/RUNBOOK.md#troubleshooting) and send the output to the maintainers.

### 4. Turn automatic deploys back on

From any machine with `gh` and admin rights on the repository:

```bash
gh variable set DEPLOY_V2 --body true -R osmbe/building-import-tool
gh variable set APP_URL --body https://new.buildings.osm.be -R osmbe/building-import-tool   # optional: public check after each deploy
```

Or in the GitHub UI: Settings → Secrets and variables → Actions → Variables.

### 5. Refresh the GRB data

Start **Actions → GRB Import → Run workflow** (1–2 hours). It rebuilds GRB in the new format and swaps it in when
it's ready:
- GBA polygons that share an id with a GBG polygon show up again;
- the disk freed by the dropped columns comes back.

The site keeps serving the current data until the swap.

### 6. Send the schema snapshot to the maintainers

Commit `~/be2osm-bootstrap/be2osm-production-schema.sql` as `tests/db/schemas/be2osm-production.sql`, or send it
to the maintainers. CI then tests every future migration against the real production schema. The script
redacted the passwords in it.

## Check that it worked

From anywhere:

```bash
curl -s https://new.buildings.osm.be/api/health/ready
#  → {"ready":true,"sha":"<latest main commit>","migrations":{"grb":[...],"picc":[...],"urbis":[...],"common":[...]}}
curl -s https://new.buildings.osm.be/tiles/grb/catalog     # → "candidates" and "knw_candidates"
curl -s https://new.buildings.osm.be/tiles/picc/catalog    # → "candidates"
curl -s https://new.buildings.osm.be/tiles/urbis/catalog   # → "candidates"
curl -s https://new.buildings.osm.be/api/meta/data-dates   # → a date for each source imported since the upgrade
```

Then open the site, zoom in on a town (zoom 16 or more), turn on a source layer and run **Get Difference**.

From then on, every push to `main` deploys itself once CI is green. The CI **Deploy** job shows the deploy log,
and a failed deploy rolls back to the previous release. Day-to-day operations (manual rollback, heavy migrations,
restores, troubleshooting) are in [docs/RUNBOOK.md](docs/RUNBOOK.md).
