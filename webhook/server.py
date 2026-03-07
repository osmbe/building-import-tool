import json
import os
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

SECRET = os.environ.get('WEBHOOK_SECRET', '')
REPO = os.environ.get('GH_REPO', 'osmbe/building-import-tool')

ROUTES = {
    '/osm-restore': '/restore-osm.sh',
    '/grb-restore': '/restore-grb.sh',
    '/picc-restore': '/restore-picc.sh',
    '/nuxt-deploy': '/deploy-nuxt.sh',
}


def run_restore(script: str, run_id: str) -> None:
    print(f"[restore] Starting {script} from run {run_id}", flush=True)
    result = subprocess.run(
        [script, run_id, REPO],
        env=os.environ.copy(),
        capture_output=False,
    )
    if result.returncode == 0:
        print(f"[restore] {script} completed successfully", flush=True)
    else:
        print(f"[restore] {script} failed with exit code {result.returncode}", flush=True)


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        script = ROUTES.get(self.path)
        if script is None:
            self._respond(404, 'Not found')
            return

        if self.headers.get('X-Webhook-Secret', '') != SECRET:
            self._respond(401, 'Unauthorized')
            return

        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        run_id = str(body.get('run_id', ''))

        if not run_id:
            self._respond(400, 'Missing run_id')
            return

        threading.Thread(target=run_restore, args=(script, run_id), daemon=True).start()
        self._respond(202, f'Restore started for run {run_id}')

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
    print(f"[webhook] Routes: {list(ROUTES.keys())}", flush=True)
    HTTPServer(('0.0.0.0', port), WebhookHandler).serve_forever()
