import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get('WEBHOOK_SECRET', '')
REPO = os.environ.get('GH_REPO', 'osmbe/building-import-tool')

# Routes that restore from a GitHub Actions artifact (require run_id)
RESTORE_ROUTES = {
    '/osm-restore': '/restore-osm.sh',
    '/grb-restore': '/restore-grb.sh',
    '/picc-restore': '/restore-picc.sh',
    '/nuxt-deploy': '/deploy-nuxt.sh',
}

# Routes that run a local import (no run_id needed)
IMPORT_ROUTES = {
    '/import-osm': '/import-osm.sh',
    '/import-grb': '/import-grb.sh',
    '/import-picc': '/import-picc.sh',
}


def run_script(script: str, args: list = None) -> None:
    cmd = [script] + (args or [])
    print(f"[webhook] Starting {' '.join(cmd)}", flush=True)
    result = subprocess.run(
        cmd,
        env=os.environ.copy(),
        capture_output=False,
    )
    if result.returncode == 0:
        print(f"[webhook] {script} completed successfully", flush=True)
    else:
        print(f"[webhook] {script} failed with exit code {result.returncode}", flush=True)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.headers.get('X-Webhook-Secret', '') != SECRET:
            self._respond(401, 'Unauthorized')
            return

        # Restore routes (from GitHub Actions artifact)
        if self.path in RESTORE_ROUTES:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            run_id = str(body.get('run_id', ''))
            if not run_id:
                self._respond(400, 'Missing run_id')
                return
            script = RESTORE_ROUTES[self.path]
            threading.Thread(target=run_script, args=(script, [run_id, REPO]), daemon=True).start()
            self._respond(202, f'Restore started for run {run_id}')
            return

        # Local import routes (no run_id needed)
        if self.path in IMPORT_ROUTES:
            script = IMPORT_ROUTES[self.path]
            threading.Thread(target=run_script, args=(script,), daemon=True).start()
            self._respond(202, f'Import started: {script}')
            return

        self._respond(404, 'Not found')

    def _respond(self, code: int, message: str) -> None:
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(message.encode())

    def log_message(self, format, *args):
        print(f"[webhook] {format % args}", flush=True)


if __name__ == '__main__':
    port = int(os.environ.get('WEBHOOK_PORT', 9000))
    print(f"[webhook] Listening on port {port}", flush=True)
    print(f"[webhook] Restore routes: {list(RESTORE_ROUTES.keys())}", flush=True)
    print(f"[webhook] Import routes: {list(IMPORT_ROUTES.keys())}", flush=True)
    HTTPServer(('0.0.0.0', port), WebhookHandler).serve_forever()
