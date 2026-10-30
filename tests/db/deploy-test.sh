#!/usr/bin/env bash
# deploy.sh scenarios, run inside the webhook test container by tests/db/cases/80-deploy.sh.
# Real git (a local bare "origin" and a server checkout), a fake docker CLI and a fake readiness endpoint
# (tests/db/bin/deploy), the real test database for pg_isready.
set -uo pipefail
export PATH="/tests/bin/deploy:$PATH"
FAILURES=0
ok() { echo "    ok   $*"; }
ko() {
  echo "    FAIL $*"
  FAILURES=$((FAILURES + 1))
}
check() { # <message> <command...>
  local msg="$1"
  shift
  if "$@"; then ok "$msg"; else ko "$msg"; fi
}

ORIGIN=/tmp/origin.git
WORK=/tmp/work
SERVER=/tmp/server
PREFIX=ghcr.io/test/app
export GIT_AUTHOR_NAME=test GIT_AUTHOR_EMAIL=test@example.org GIT_COMMITTER_NAME=test GIT_COMMITTER_EMAIL=test@example.org

commit() { # <message> <file> <content>
  mkdir -p "$WORK/$(dirname "$2")"
  echo "$3" >"$WORK/$2"
  git -C "$WORK" add -A && git -C "$WORK" commit -qm "$1" && git -C "$WORK" rev-parse HEAD
}

git init -q --bare -b main "$ORIGIN"
git init -q -b main "$WORK"
echo ".env" >"$WORK/.gitignore"
for f in docker-compose.yml caddy/Caddyfile config/martin/{grb,osm,picc,urbis}-config.yaml; do
  mkdir -p "$WORK/$(dirname "$f")" && echo "v1" >"$WORK/$f"
done
A=$(commit "A" README v1)
B=$(commit "B: GRB tiles config" config/martin/grb-config.yaml v2)
C=$(commit "C: app only" README v2)
git -C "$WORK" push -q "$ORIGIN" main
git -C "$WORK" checkout -q -b feature
D=$(commit "D: not on main" README v3)
git -C "$WORK" push -q "$ORIGIN" feature
git clone -q "$ORIGIN" "$SERVER"
git -C "$SERVER" reset -q --hard "$A"
echo "POSTGRES_USER=be2osm" >"$SERVER/.env"

deploy() { # [sha]: runs deploy.sh with a fresh docker log, output in $OUT
  rm -f /tmp/state/docker.log
  OUT=$(COMPOSE_PROJECT_DIR="$SERVER" DEPLOY_GIT_URL="$ORIGIN" IMAGE_PREFIX="$PREFIX" FAKE_PREFIX="$PREFIX" \
    FAKE_STATE=/tmp/state DEPLOY_MIN_FREE_GB="${MIN_FREE_GB:-0}" DEPLOY_READY_TIMEOUT=2 GH_TOKEN="" \
    bash /repo/webhook/deploy.sh "$@" 2>&1)
}
head_is() { [ "$(git -C "$SERVER" rev-parse HEAD)" = "$1" ]; }
called() { grep -qF -- "$1" /tmp/state/docker.log 2>/dev/null; }
not_called() { ! called "$1"; }
deployed() { [ "$(cat "/tmp/state/tags/$(tr '/:' '__' <<<"$PREFIX/$1:deployed")")" = "sha256:$1:sha-$2" ]; }

echo "  first deploy (B: changes the GRB Martin config)"
deploy "$B"
check "succeeds" [ $? = 0 ] || echo "$OUT"
check "the checkout is at B" head_is "$B"
check "the three images of B are pulled" called "pull --quiet $PREFIX/webhook:sha-$B"
check "they are tagged :deployed" deployed nuxt-app "$B"
check "migrations run with --deploy" called "run --rm -T --no-deps processing just db-migrate --deploy"
check "the GRB Martin server is recreated" called "up -d --no-deps --force-recreate grb-tiles"
check "the other Martin servers are not" not_called "osm-tiles"
check "Caddy is not recreated" not_called "caddy"
check "nuxt-app is recreated" called "up -d --no-deps nuxt-app"
check "the webhook is recreated from a helper (its image is new)" called "run -d --rm --name be2osm-webhook-recreate"

echo "  deploy of the head of main (C), no sha given"
deploy
check "succeeds" [ $? = 0 ] || echo "$OUT"
check "the checkout is at C" head_is "$C"
check "no Martin server is recreated" not_called "tiles"
check "the previous images are kept as :previous" [ -f "/tmp/state/tags/$(tr '/:' '__' <<<"$PREFIX/nuxt-app:previous")" ]
check "the webhook is recreated again (new image)" called "be2osm-webhook-recreate"

echo "  refusals (nothing changes)"
deploy "$D"
check "a commit that is not on main is refused" [ $? != 0 ]
check "the checkout stays at C" head_is "$C"
check "nothing is pulled" not_called "pull"

deploy deadbeef
check "an unknown commit is refused" [ $? != 0 ]

echo "local" >>"$SERVER/docker-compose.yml"
deploy "$B"
check "local changes in the checkout are refused" [ $? != 0 ]
check "the message says why" grep -q "local changes" <<<"$OUT"
git -C "$SERVER" checkout -q -- docker-compose.yml

echo "NUXT_IMAGE=foo" >>"$SERVER/.env"
deploy "$B"
check "an image override in .env is refused" [ $? != 0 ]
sed -i '/NUXT_IMAGE/d' "$SERVER/.env"

MIN_FREE_GB=100000000 deploy "$B"
check "too little free disk is refused" [ $? != 0 ]
check "the message says why" grep -q "GB free" <<<"$OUT"

FAKE_MISSING_IMAGE=processing deploy "$B"
check "a missing image is refused" [ $? != 0 ]
check "the checkout stays at C" head_is "$C"
check "the deployed tags are unchanged" deployed nuxt-app "$C"

echo "  failures after the checkout changed roll back"
FAKE_MIGRATE_EXIT=1 deploy "$B"
check "a failed migration fails the deploy" [ $? != 0 ]
check "the checkout is back at C" head_is "$C"
check "the images are back to C" deployed nuxt-app "$C"

# A (an older commit of main: deploying it is how a release is rolled back by hand) has another GRB config
FAKE_READY_FAIL=1 deploy "$A"
check "an app that never gets ready fails the deploy" [ $? != 0 ]
check "the checkout is back at C" head_is "$C"
check "the images are back to C" deployed nuxt-app "$C"
check "the recreated Martin server is recreated again with the old config" \
  [ "$(grep -c "force-recreate grb-tiles" /tmp/state/docker.log)" = 2 ]
check "the app is restarted on the previous image" [ "$(cat /tmp/state/nuxt-running)" = "sha256:nuxt-app:sha-$C" ]

exit "$FAILURES"
