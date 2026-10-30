# .github/scripts/webhook-job.sh waits for server jobs and fails the workflow step when they fail.
out=$(webhook_run webhook bash /tests/webhook-job-test.sh 2>&1) && rc=0 || rc=$?
printf '%s\n' "$out" | sed 's/^    ok  /    \x1b[32mok\x1b[0m  /; s/^    FAIL/    \x1b[31mFAIL\x1b[0m/'
CASE_FAILURES=$((CASE_FAILURES + rc))
