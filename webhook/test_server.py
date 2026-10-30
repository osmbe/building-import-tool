"""Tests for server.py: routes, auth, the job registry and the global job lock.

Needs flock (util-linux), so it runs in the webhook image: tests/db/cases/05-webhook-server.sh.
    python -m unittest discover -s webhook -p 'test_*.py'
"""

import http.client
import json
import os
import shutil
import tempfile
import threading
import time
import unittest

TMP = tempfile.mkdtemp(prefix="webhook-test-")
SCRIPTS = os.path.join(TMP, "scripts")
STATE = os.path.join(TMP, "state")
os.makedirs(SCRIPTS)
os.environ.update(
    WEBHOOK_SECRET="s3cret",
    GH_REPO="owner/repo",
    WEBHOOK_SCRIPTS_DIR=SCRIPTS,
    WEBHOOK_STATE_DIR=STATE,
    DEPLOY_LOCK_WAIT="1",
)

import server


def script(name: str, body: str) -> None:
    with open(os.path.join(SCRIPTS, name), "w") as f:
        f.write("#!/bin/bash\nset -euo pipefail\n" + body + "\n")


class WebhookServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.serve(0)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        shutil.rmtree(TMP, ignore_errors=True)

    def setUp(self):
        for name in ["deploy.sh", "restore-grb.sh", "update-osm.sh"]:
            script(name, 'echo "$(basename "$0") $*"')

    def request(self, method, path, body=None, secret="s3cret"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {"Content-Type": "application/json"}
        if secret is not None:
            headers["X-Webhook-Secret"] = secret
        conn.request(
            method,
            path,
            body=None if body is None else json.dumps(body),
            headers=headers,
        )
        response = conn.getresponse()
        payload = json.loads(response.read() or b"{}")
        conn.close()
        return response.status, payload

    def wait(self, job_id, timeout=15):
        deadline = time.time() + timeout
        while time.time() < deadline:
            status, job = self.request("GET", f"/jobs/{job_id}")
            self.assertEqual(status, 200)
            if job["status"] not in ("queued", "running"):
                return job
            time.sleep(0.1)
        self.fail(f"job {job_id} did not finish")

    def test_health_needs_no_secret(self):
        self.assertEqual(
            self.request("GET", "/health", secret=None), (200, {"status": "ok"})
        )

    def test_post_requires_the_secret(self):
        self.assertEqual(self.request("POST", "/deploy", {}, secret=None)[0], 401)
        self.assertEqual(self.request("POST", "/deploy", {}, secret="wrong")[0], 401)

    def test_an_empty_configured_secret_refuses_everything(self):
        original = server.SECRET
        server.SECRET = ""
        try:
            self.assertEqual(self.request("POST", "/deploy", {}, secret="")[0], 401)
        finally:
            server.SECRET = original

    def test_job_status_requires_the_secret(self):
        _, started = self.request("POST", "/deploy", {})
        self.assertEqual(
            self.request("GET", started["status_url"], secret=None)[0], 401
        )

    def test_unknown_routes_and_jobs(self):
        self.assertEqual(self.request("POST", "/nope", {})[0], 404)
        self.assertEqual(
            self.request("GET", "/jobs/0123456789abcdef0123456789abcdef")[0], 404
        )
        self.assertEqual(self.request("GET", "/jobs/../../etc/passwd")[0], 404)

    def test_restore_needs_a_numeric_run_id(self):
        self.assertEqual(self.request("POST", "/grb-restore", {})[0], 400)
        self.assertEqual(
            self.request("POST", "/grb-restore", {"run_id": "1; rm -rf /"})[0], 400
        )

    def test_invalid_bodies_are_rejected(self):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        conn.request(
            "POST", "/deploy", body="not json", headers={"X-Webhook-Secret": "s3cret"}
        )
        self.assertEqual(conn.getresponse().status, 400)
        conn.close()

    def test_restore_job_runs_the_script_with_run_id_and_repo(self):
        status, started = self.request("POST", "/grb-restore", {"run_id": 12345})
        self.assertEqual(status, 202)
        self.assertEqual(started["status_url"], f"/jobs/{started['job_id']}")
        job = self.wait(started["job_id"])
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(job["exit_code"], 0)
        self.assertEqual(job["name"], "grb-restore")
        self.assertIn("restore-grb.sh 12345 owner/repo", job["log_tail"])

    def test_deploy_passes_the_sha(self):
        _, started = self.request("POST", "/deploy", {"sha": "abc1234"})
        self.assertIn("deploy.sh abc1234", self.wait(started["job_id"])["log_tail"])
        self.assertEqual(self.request("POST", "/deploy", {"sha": "not-a-sha"})[0], 400)

    def test_a_failing_script_fails_the_job_with_its_log(self):
        script("update-osm.sh", 'echo "about to fail"; exit 3')
        _, started = self.request("POST", "/update-osm", {})
        job = self.wait(started["job_id"])
        self.assertEqual((job["status"], job["exit_code"]), ("failed", 3))
        self.assertIn("about to fail", job["log_tail"])

    def test_jobs_run_one_at_a_time(self):
        marks = os.path.join(TMP, "marks")
        script(
            "update-osm.sh",
            f'echo "start $1" >> {marks}; sleep 0.5; echo "end $1" >> {marks}',
        )
        first = server.start_job("a", "update-osm.sh", ["a"])
        time.sleep(0.1)
        second = server.start_job("b", "update-osm.sh", ["b"])
        self.wait(first["id"])
        self.wait(second["id"])
        with open(marks) as f:
            self.assertEqual(
                f.read().split("\n")[:4], ["start a", "end a", "start b", "end b"]
            )

    def test_a_deploy_gives_up_as_busy_when_another_job_holds_the_lock(self):
        script("update-osm.sh", "sleep 3")
        running = server.start_job("update-osm", "update-osm.sh", [])
        time.sleep(0.3)
        _, started = self.request(
            "POST", "/deploy", {}
        )  # DEPLOY_LOCK_WAIT is 1s in these tests
        self.assertEqual(self.wait(started["job_id"])["status"], "busy")
        self.wait(running["id"])

    def test_jobs_left_running_by_a_previous_process_are_interrupted(self):
        job = {
            "id": "f" * 32,
            "name": "grb-restore",
            "status": "running",
            "finished_at": None,
        }
        server._save(job)
        server.recover()
        self.assertEqual(server.load_job("f" * 32)["status"], "interrupted")

    def test_old_job_records_are_pruned(self):
        original = server.KEEP_JOBS
        server.KEEP_JOBS = 3
        try:
            for _ in range(5):
                self.wait(server.start_job("deploy", "deploy.sh", [])["id"])
            records = [
                name for name in os.listdir(server.JOBS_DIR) if name.endswith(".json")
            ]
            self.assertLessEqual(
                len(records), 4
            )  # the 3 kept plus the one just created
        finally:
            server.KEEP_JOBS = original


if __name__ == "__main__":
    unittest.main()
