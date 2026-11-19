"""Inspect the running prototype through the WebView2 debugging port.

    python inspect.py <port> <seconds> [--reload] [--shot out.png] [--eval "js"]

Prints console output, uncaught errors and failed requests seen during the wait,
then the value of the --eval expression, and optionally saves a screenshot.
"""
import argparse
import sys
import base64
import json
import time
import urllib.request

from websockets.sync.client import connect

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
parser = argparse.ArgumentParser()
parser.add_argument("port", type=int)
parser.add_argument("seconds", type=float)
parser.add_argument("--reload", action="store_true")
parser.add_argument("--shot")
parser.add_argument("--eval", dest="expression")
parser.add_argument("--quiet-network", action="store_true")
parser.add_argument("--width", type=int, default=330)
parser.add_argument("--cookies", action="store_true")
parser.add_argument("--match", default="/__viora/")
parser.add_argument("--ignore", default="")
args = parser.parse_args()

targets = json.load(urllib.request.urlopen(f"http://127.0.0.1:{args.port}/json", timeout=10))
pages = [t for t in targets if t.get("type") == "page"]
page = next((t for t in pages if args.match in t.get("url", "")), pages[0] if pages else None)
if not page:
    raise SystemExit(f"no page target; targets: {[(t.get('type'), t.get('url')) for t in targets]}")
print("target:", page["url"])

with connect(page["webSocketDebuggerUrl"], max_size=64 * 1024 * 1024) as ws:
    counter = 0
    pending = {}

    def send(method, **params):
        global counter
        counter += 1
        ws.send(json.dumps({"id": counter, "method": method, "params": params}))
        return counter

    def text_of(arg):
        if "value" in arg:
            return str(arg["value"])
        return arg.get("description") or arg.get("type", "?")

    requests = {}
    seen = {}

    def emit(line):
        if args.ignore and any(part and part in line for part in args.ignore.split("||")):
            return
        key = line[:160]
        seen[key] = seen.get(key, 0) + 1
        if seen[key] == 1:
            print(line[:args.width].replace(chr(10), " | "))

    def handle(message):
        method = message.get("method")
        p = message.get("params", {})
        if method == "Runtime.consoleAPICalled":
            line = " ".join(text_of(a) for a in p.get("args", []))
            emit(f"[console.{p.get('type')}] {line[:700]}")
        elif method == "Runtime.exceptionThrown":
            d = p.get("exceptionDetails", {})
            exc = d.get("exception", {})
            emit(f"[exception] {d.get('text')} {str(exc.get('description', ''))[:900]} @ {d.get('url', '')}:{d.get('lineNumber')}")
        elif method == "Log.entryAdded":
            e = p.get("entry", {})
            emit(f"[log.{e.get('level')}] {e.get('text', '')[:500]} {e.get('url', '')[:160]}")
        elif method == "Network.requestWillBeSent":
            requests[p["requestId"]] = p["request"]["url"]
        elif method == "Network.responseReceived" and not args.quiet_network:
            r = p["response"]
            if r["status"] >= 400:
                emit(f"[http {r['status']}] {r['url'][:220]}")
        elif method == "Network.loadingFailed":
            emit(f"[net failed] {p.get('errorText')} blocked={p.get('blockedReason')} cors={p.get('corsErrorStatus')} {requests.get(p.get('requestId'), '')[:220]}")
        elif "id" in message:
            pending[message["id"]] = message

    def wait_for(request_id, timeout=30):
        end = time.time() + timeout
        while time.time() < end:
            if request_id in pending:
                return pending.pop(request_id)
            try:
                handle(json.loads(ws.recv(timeout=0.5)))
            except TimeoutError:
                pass
        return None

    for domain in ("Runtime", "Log", "Network", "Page"):
        send(f"{domain}.enable")
    if args.reload:
        send("Page.reload", ignoreCache=True)
    end = time.time() + args.seconds
    while time.time() < end:
        try:
            handle(json.loads(ws.recv(timeout=0.5)))
        except TimeoutError:
            pass
    repeats = {k: v for k, v in seen.items() if v > 1}
    if repeats:
        print("repeated:", {k[:70]: v for k, v in repeats.items()})
    if args.expression:
        result = wait_for(send("Runtime.evaluate", expression=args.expression, awaitPromise=True, returnByValue=True))
        value = (result or {}).get("result", {})
        print("eval:", json.dumps(value.get("result", {}).get("value", value), ensure_ascii=False, indent=1)[:6000])
    if args.cookies:
        result = wait_for(send("Network.getAllCookies"))
        cookies = (result or {}).get("result", {}).get("cookies", [])
        print("cookies:", len(cookies), sorted({f"{c['domain']}:{c['name']}" for c in cookies}))
    if args.shot:
        result = wait_for(send("Page.captureScreenshot", format="png"))
        data = (result or {}).get("result", {}).get("data")
        if data:
            with open(args.shot, "wb") as f:
                f.write(base64.b64decode(data))
            print("screenshot:", args.shot)
        else:
            print("screenshot failed:", result)
