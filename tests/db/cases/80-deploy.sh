#!/usr/bin/env bash
# webhook/deploy.sh: checkout, image tags, migrations, Martin/Caddy/app recreation, readiness and rollbacks
# (tests/db/deploy-test.sh, with a fake docker CLI and readiness endpoint).
out=$(webhook_run webhook bash /tests/deploy-test.sh 2>&1) && rc=0 || rc=$?
printf '%s\n' "$out" | sed 's/^    ok  /    \x1b[32mok\x1b[0m  /; s/^    FAIL/    \x1b[31mFAIL\x1b[0m/'
CASE_FAILURES=$((CASE_FAILURES + rc))
