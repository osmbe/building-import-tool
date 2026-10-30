#!/usr/bin/env bash
# webhook/server.py unit tests (routes, auth, job registry, global job lock), in the webhook image.
out=$(webhook_run webhook python -m unittest discover -s /repo/webhook -p 'test_*.py' 2>&1) && rc=0 || rc=$?
assert_eq "$rc" "0" "webhook server tests pass ($(grep -Eo 'Ran [0-9]+ tests' <<<"$out"))"
[ "$rc" = 0 ] || log "$out"
