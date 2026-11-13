"""Local deterministic pages for manual session/lazy-loading/find verification."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import time

log = Path(__file__).resolve().parents[1] / "docs/verification/performance-fixture-requests.jsonl"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        with log.open("a", encoding="utf-8") as file:
            file.write(json.dumps({"time": time.time(), "path": self.path}) + "\n")
        title = {"/one": "One", "/two": "Two", "/three": "Three"}.get(self.path, "Fixture")
        body = (f'<!doctype html><html><head><meta charset="utf-8"><title>Labeeb test {title}</title>'
                '<link rel="icon" href="data:,"></head><body style="font:24px system-ui;padding:40px">'
                f'<h1>Labeeb performance test {title}</h1><p>Find this needle in the page.</p>'
                '<p>Another needle for the next-match control.</p>'
                '<a href="/one">One</a> · <a href="/two">Two</a> · <a href="/three">Three</a></body></html>').encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def log_message(self, *args):
        pass

ThreadingHTTPServer(("127.0.0.1", 18769), Handler).serve_forever()
