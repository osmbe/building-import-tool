#!/usr/bin/env bash
# .github/scripts/webhook-job.sh (how workflows start a server job and wait for it) against the real
# webhook server with stand-in job scripts. Run inside the webhook test container by
# tests/db/cases/06-webhook-job.sh.
set -uo pipefail
FAILURES=0
check() { # <message> <command...>
  local msg="$1"
  shift
  if "$@"; then echo "    ok   $msg"; else
    echo "    FAIL $msg"
    FAILURES=$((FAILURES + 1))
  fi
}

mkdir -p /tmp/scripts
printf 'echo "restoring run $1 of $2"\n' >/tmp/scripts/restore-grb.sh
printf 'echo "osm update failed"; exit 4\n' >/tmp/scripts/update-osm.sh
WEBHOOK_SECRET=s3cret WEBHOOK_PORT=9100 WEBHOOK_SCRIPTS_DIR=/tmp/scripts WEBHOOK_STATE_DIR=/tmp/state \
  python /server.py >/tmp/server.log 2>&1 &
for _ in $(seq 1 50); do
  curl -fsS http://127.0.0.1:9100/health >/dev/null 2>&1 && break
  sleep 0.1
done

export WEBHOOK_URL=http://127.0.0.1:9100 WEBHOOK_SECRET=s3cret POLL_INTERVAL=1
job() { OUT=$(bash /ci-scripts/webhook-job.sh "$@" 2>&1); }

job grb-restore '{"run_id": "77"}'
check "a succeeding job makes the step succeed" [ $? = 0 ]
check "the job log is printed" grep -q "restoring run 77 of osmbe/building-import-tool" <<<"$OUT"

job update-osm
check "a failing job makes the step fail" [ $? != 0 ]
check "with its log and exit code" grep -q "osm update failed" <<<"$OUT"
check "and its exit code" grep -q "exit code 4" <<<"$OUT"

WEBHOOK_SECRET=wrong job update-osm
check "a wrong secret fails the step" [ $? != 0 ]

exit "$FAILURES"
