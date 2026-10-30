"""Webhook server: runs the server-side jobs (deploys, restores of CI artifacts, imports, updates).

Every POST route requires the X-Webhook-Secret header and starts a job, answering 202 with
{"job_id": ..., "status_url": "/jobs/<id>"}. GET /jobs/<id> (same header) returns the job's status
(queued, running, succeeded, failed, busy, interrupted) and the end of its log, so GitHub Actions can wait
for the result instead of assuming success. GET /health needs no secret.

Jobs run one at a time: each script runs under one global flock on the state volume, which deploy.sh,
the restores, imports and updates all share. Job records and logs live in the state directory, so they
survive a restart of the webhook (a deploy recreates it); a job that was running when the server stopped
is reported as interrupted.

The scripts are read from the checkout (<COMPOSE_PROJECT_DIR>/webhook), so they always match the deployed
code.
"""

import json
import os
import re
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ.get("WEBHOOK_SECRET", "")
REPO = os.environ.get("GH_REPO", "osmbe/building-import-tool")
SCRIPTS_DIR = os.environ.get(
    "WEBHOOK_SCRIPTS_DIR",
    os.path.join(os.environ.get("COMPOSE_PROJECT_DIR", "/"), "webhook"),
)
STATE_DIR = os.environ.get("WEBHOOK_STATE_DIR", "/state")
JOBS_DIR = os.path.join(STATE_DIR, "jobs")
LOCK_FILE = os.path.join(STATE_DIR, "jobs.lock")
# How long a job waits for the running one before it gives up as "busy" (seconds)
LOCK_WAIT = {
    "deploy": int(os.environ.get("DEPLOY_LOCK_WAIT", str(45 * 60))),
    "default": int(os.environ.get("JOB_LOCK_WAIT", str(6 * 3600))),
}
BUSY_EXIT = 75  # flock -E: exit code when the lock wait times out
LOG_TAIL_LINES = 200
KEEP_JOBS = 200

# route -> (script, whether the body must carry a run_id)
ROUTES = {
    "/deploy": ("deploy.sh", False),
    "/osm-restore": ("restore-osm.sh", True),
    "/grb-restore": ("restore-grb.sh", True),
    "/picc-restore": ("restore-picc.sh", True),
    "/urbis-restore": ("restore-urbis.sh", True),
    "/import-osm": ("import-osm.sh", False),
    "/import-grb": ("import-grb.sh", False),
    "/import-picc": ("import-picc.sh", False),
    "/import-urbis": ("import-urbis.sh", False),
    "/update-osm": ("update-osm.sh", False),
    "/update-grb": ("update-grb.sh", False),
    "/update-picc": ("update-picc.sh", False),
    "/update-urbis": ("update-urbis.sh", False),
}

SHA_RE = re.compile(r"^[0-9a-f]{7,40}$")
RUN_ID_RE = re.compile(r"^[0-9]{1,20}$")
JOB_ID_RE = re.compile(r"^[0-9a-f]{32}$")

_lock = threading.Lock()


def _job_path(job_id: str) -> str:
    return os.path.join(JOBS_DIR, f"{job_id}.json")


def _log_path(job_id: str) -> str:
    return os.path.join(JOBS_DIR, f"{job_id}.log")


def _save(job: dict) -> None:
    tmp = _job_path(job["id"]) + ".tmp"
    with open(tmp, "w") as f:
        json.dump(job, f)
    os.replace(tmp, _job_path(job["id"]))


def load_job(job_id: str):
    try:
        with open(_job_path(job_id)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def log_tail(job_id: str, lines: int = LOG_TAIL_LINES) -> str:
    try:
        with open(_log_path(job_id), errors="replace") as f:
            return "".join(f.readlines()[-lines:])
    except OSError:
        return ""


def _prune() -> None:
    records = sorted(
        (os.path.getmtime(os.path.join(JOBS_DIR, name)), name[:-5])
        for name in os.listdir(JOBS_DIR)
        if name.endswith(".json")
    )
    for _, job_id in records[:-KEEP_JOBS]:
        for path in (_job_path(job_id), _log_path(job_id)):
            try:
                os.remove(path)
            except OSError:
                pass


def recover() -> None:
    """Mark the jobs a previous server process left queued or running as interrupted."""
    os.makedirs(JOBS_DIR, exist_ok=True)
    for name in os.listdir(JOBS_DIR):
        if not name.endswith(".json"):
            continue
        job = load_job(name[:-5])
        if job and job["status"] in ("queued", "running"):
            job["status"] = "interrupted"
            job["finished_at"] = time.time()
            _save(job)


def _run(job: dict, cmd: list) -> None:
    job["status"] = "running"
    job["started_at"] = time.time()
    _save(job)
    print(f"[webhook] job {job['id']}: {' '.join(cmd)}", flush=True)
    with open(_log_path(job["id"]), "ab") as log:
        try:
            code = subprocess.run(
                cmd, stdout=log, stderr=subprocess.STDOUT, env=os.environ.copy(), check=False
            ).returncode
        except OSError as error:
            log.write(f"[webhook] cannot start the job: {error}\n".encode())
            code = 127
    job["exit_code"] = code
    job["status"] = (
        "succeeded" if code == 0 else "busy" if code == BUSY_EXIT else "failed"
    )
    job["finished_at"] = time.time()
    _save(job)
    print(f"[webhook] job {job['id']} {job['status']} (exit {code})", flush=True)


def start_job(name: str, script: str, args: list) -> dict:
    job = {
        "id": uuid.uuid4().hex,
        "name": name,
        "script": script,
        "args": args,
        "status": "queued",
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
        "exit_code": None,
    }
    wait = LOCK_WAIT["deploy"] if script == "deploy.sh" else LOCK_WAIT["default"]
    cmd = [
        "flock",
        "-w",
        str(wait),
        "-E",
        str(BUSY_EXIT),
        LOCK_FILE,
        "bash",
        os.path.join(SCRIPTS_DIR, script),
        *args,
    ]
    with _lock:
        _prune()
        _save(job)
    threading.Thread(target=_run, args=(job, cmd), daemon=True).start()
    return job


class WebhookHandler(BaseHTTPRequestHandler):
    def _authorized(self) -> bool:
        if SECRET and self.headers.get("X-Webhook-Secret", "") == SECRET:
            return True
        self._json(401, {"error": "unauthorized"})
        return False

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        try:
            body = json.loads(self.rfile.read(length))
        except ValueError:
            return None
        return body if isinstance(body, dict) else None

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"status": "ok"})
            return
        match = re.fullmatch(r"/jobs/([^/]+)", self.path)
        if match:
            if not self._authorized():
                return
            job_id = match.group(1)
            job = load_job(job_id) if JOB_ID_RE.match(job_id) else None
            if job is None:
                self._json(404, {"error": "unknown job"})
                return
            self._json(200, {**job, "log_tail": log_tail(job_id)})
            return
        self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._authorized():
            return
        route = ROUTES.get(self.path)
        if route is None:
            self._json(404, {"error": "not found"})
            return
        script, needs_run_id = route
        body = self._body()
        if body is None:
            self._json(400, {"error": "the body must be a JSON object"})
            return

        args = []
        if needs_run_id:
            run_id = str(body.get("run_id", ""))
            if not RUN_ID_RE.match(run_id):
                self._json(400, {"error": "missing or invalid run_id"})
                return
            args = [run_id, REPO]
        elif script == "deploy.sh" and body.get("sha") is not None:
            sha = str(body["sha"])
            if not SHA_RE.match(sha):
                self._json(400, {"error": "invalid sha"})
                return
            args = [sha]

        job = start_job(self.path.lstrip("/"), script, args)
        self._json(
            202,
            {
                "job_id": job["id"],
                "status_url": f"/jobs/{job['id']}",
                "status": job["status"],
            },
        )

    def _json(self, code: int, payload: dict) -> None:
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        print(f"[webhook] {format % args}", flush=True)


def serve(port: int) -> ThreadingHTTPServer:
    recover()
    return ThreadingHTTPServer(("0.0.0.0", port), WebhookHandler)


if __name__ == "__main__":
    port = int(os.environ.get("WEBHOOK_PORT", "9000"))
    if not SECRET:
        print(
            "[webhook] WEBHOOK_SECRET is not set: every request will be refused",
            flush=True,
        )
    print(
        f"[webhook] Listening on port {port}, scripts in {SCRIPTS_DIR}, state in {STATE_DIR}",
        flush=True,
    )
    print(f"[webhook] Routes: {sorted(ROUTES)}", flush=True)
    serve(port).serve_forever()
