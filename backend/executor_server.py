"""Standalone code executor service.

The only component that needs the Docker socket. It accepts nothing but
{"code", "language"} and builds the hardened `docker run` itself (sandbox.py),
so a compromised app container cannot start arbitrary containers through it.

Stdlib only. Run with: python executor_server.py
"""

import hmac
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sandbox

MAX_BODY_BYTES = 256 * 1024


def make_handler(token: str):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if self.path == "/health":
                self._send(200, {"ok": True})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/run":
                self._send(404, {"error": "not found"})
                return
            auth = self.headers.get("Authorization", "")
            if not hmac.compare_digest(auth.encode(), f"Bearer {token}".encode()):
                self._send(401, {"error": "unauthorized"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                length = -1
            if length <= 0 or length > MAX_BODY_BYTES:
                self._send(413 if length > 0 else 400, {"error": "invalid body size"})
                return
            try:
                data = json.loads(self.rfile.read(length).decode("utf-8"))
                code, language = data["code"], data["language"]
                if not isinstance(code, str) or not isinstance(language, str):
                    raise ValueError
            except (ValueError, KeyError, TypeError):
                self._send(400, {"error": "expected {code, language} strings"})
                return
            self._send(200, sandbox.run_code(code, language))

        def log_message(self, fmt, *args):
            sys.stderr.write("executor: " + (fmt % args) + "\n")

    return Handler


def main() -> None:
    token = os.getenv("CODE_EXECUTOR_TOKEN", "").strip()
    if len(token) < 16:
        sys.exit("CODE_EXECUTOR_TOKEN must be set (at least 16 characters).")
    port = int(os.getenv("EXECUTOR_PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(token))
    print(f"Code executor listening on :{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
