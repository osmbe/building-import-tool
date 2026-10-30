#!/usr/bin/env bash
# Start a job on the server webhook and wait for its result (the workflow step fails when the job fails).
#
#   webhook-job.sh <route> [<json body>]      e.g. webhook-job.sh grb-restore '{"run_id": "123"}'
#
# Env: WEBHOOK_URL, WEBHOOK_SECRET, JOB_TIMEOUT (seconds, default 5h), POLL_INTERVAL (seconds, default 15).
# An old webhook (before job tracking) answers with plain text: the job is then only started, not awaited.
set -euo pipefail

route="${1:?usage: webhook-job.sh <route> [json body]}"
body="${2:-}"
[ -n "$body" ] || body='{}'
: "${WEBHOOK_URL:?}" "${WEBHOOK_SECRET:?}"
timeout="${JOB_TIMEOUT:-18000}"
interval="${POLL_INTERVAL:-15}"

response=$(curl -fsS -X POST "${WEBHOOK_URL}/${route}" -H "X-Webhook-Secret: ${WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" -d "$body")
job_id=$(jq -r '.job_id // empty' <<<"$response" 2>/dev/null || true)
if [ -z "$job_id" ]; then
  echo "::warning::The webhook started ${route} but does not track jobs yet (server not bootstrapped): $response"
  exit 0
fi
echo "Job ${job_id} started (${route})"

deadline=$(($(date +%s) + timeout))
errors=0
while :; do
  sleep "$interval"
  if ! job=$(curl -fsS "${WEBHOOK_URL}/jobs/${job_id}" -H "X-Webhook-Secret: ${WEBHOOK_SECRET}"); then
    # The webhook restarts at the end of some deploys: tolerate a few failed polls
    errors=$((errors + 1))
    [ "$errors" -lt 20 ] || {
      echo "::error::The webhook stopped answering"
      exit 1
    }
    continue
  fi
  errors=0
  status=$(jq -r .status <<<"$job")
  case "$status" in
  queued | running)
    [ "$(date +%s)" -lt "$deadline" ] || {
      echo "::error::Job still ${status} after ${timeout}s"
      exit 1
    }
    ;;
  *)
    echo "----- end of the job log -----"
    jq -r .log_tail <<<"$job"
    echo "-------------------------------"
    if [ "$status" = succeeded ]; then
      echo "Job ${job_id} succeeded"
      exit 0
    fi
    echo "::error::Job ${job_id} ${status} (exit code $(jq -r .exit_code <<<"$job"))"
    exit 1
    ;;
  esac
done
