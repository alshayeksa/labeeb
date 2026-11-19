"""Reproducible loopback comparison; does not modify the application downloader.

Build the adapter with:
  cargo build --manifest-path src-tauri/Cargo.toml --release --no-default-features --example download_benchmark
Place the official Windows aria2c.exe in artifacts/download-comparison, then run this file.
All downloads are synthetic, local, and verified with SHA-256. No internet speed claim.
"""
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import hashlib
import json
import platform
import statistics
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / 'artifacts/download-comparison'
OUT = ROOT / 'docs/verification/download-comparison.json'
LABEEB = ROOT / 'src-tauri/target/release/examples/download_benchmark.exe'
ARIA = WORK / 'aria2c.exe'
MIB = 1024 * 1024
DATA = bytes((i * 31 + i // 7) % 251 for i in range(65536)) * 512
EXPECTED = hashlib.sha256(DATA).hexdigest()
LOCK = threading.Lock()
STATES = {}


class BenchmarkServer(ThreadingHTTPServer):
    # The standard library default (5) is below our eight clients. Avoid
    # measuring the test server's accept backlog instead of the downloaders.
    request_queue_size = 64


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def do_HEAD(self):
        self.respond(False)

    def do_GET(self):
        self.respond(True)

    def respond(self, body):
        key = self.path.split('?')[0]
        with LOCK:
            state = STATES.get(key)
        if state is None:
            self.send_error(404)
            return
        start, end = 0, len(DATA) - 1
        requested = self.headers.get('Range')
        ranged = bool(requested and state['ranges'])
        if ranged:
            a, b = requested.removeprefix('bytes=').split('-', 1)
            start = int(a)
            end = min(int(b) if b else end, end)
        substantial = body and end - start > 1
        admitted = False
        with LOCK:
            state['requests'] += 1
            if requested:
                state['range_requests'] += 1
            if substantial and state['limit'] and state['active'] >= state['limit']:
                state['rejections'] += 1
                rejected = True
            else:
                rejected = False
                if substantial:
                    state['active'] += 1
                    admitted = True
                    state['peak'] = max(state['peak'], state['active'])
            cut = admitted and state['drops_left'] > 0
            if cut:
                state['drops_left'] -= 1
                state['drops'] += 1
        try:
            if rejected:
                self.send_response(429)
                self.send_header('Content-Length', '0')
                self.send_header('Retry-After', '1')
                self.send_header('Connection', 'close')
                self.end_headers()
                self.close_connection = True
                return
            self.send_response(206 if ranged else 200)
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('ETag', '"labeeb-benchmark-v1"')
            self.send_header('Accept-Ranges', 'bytes' if state['ranges'] else 'none')
            self.send_header('Connection', 'close')
            if ranged:
                self.send_header('Content-Range', f'bytes {start}-{end}/{len(DATA)}')
            self.end_headers()
            self.close_connection = True
            if not body:
                return
            stop = min(end + 1, start + 256 * 1024) if cut else end + 1
            for position in range(start, stop, 65536):
                chunk = DATA[position:min(position + 65536, stop)]
                if state['rate']:
                    time.sleep(len(chunk) / state['rate'])
                self.wfile.write(chunk)
                with LOCK:
                    state['sent'] += len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            if admitted:
                with LOCK:
                    state['active'] -= 1


def state_for(key, rate=0, ranges=True, drops=0, limit=0):
    state = dict(rate=rate, ranges=ranges, drops_left=drops, limit=limit,
                 active=0, peak=0, sent=0, requests=0, range_requests=0, rejections=0, drops=0)
    with LOCK:
        STATES[key] = state
    return state


def command(engine, url, output):
    if engine.startswith('labeeb'):
        return [str(LABEEB), url, str(output), '1' if engine == 'labeeb-1' else '8']
    return [str(ARIA), '--no-conf=true', '--split=8', '--max-connection-per-server=8',
            '--min-split-size=1M', '--file-allocation=none', '--continue=true',
            '--auto-file-renaming=false', '--allow-overwrite=true', '--max-tries=10',
            '--retry-wait=1', '--connect-timeout=20', '--timeout=45', '--auto-save-interval=1',
            '--summary-interval=0', '--console-log-level=warn', '--enable-color=false',
            '--dir=' + str(output.parent), '--out=' + output.name, url]


def wait_idle(state):
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline:
        with LOCK:
            active = state['active']
        if not active:
            return
        time.sleep(.02)
    raise RuntimeError('HTTP handlers did not stop')


def run_one(server, scenario, engine, number, **config):
    key = f'/{scenario}-{engine}-{number}'
    state = state_for(key, **config)
    output = WORK / (key[1:] + '.bin')
    # Only remove this run's own outputs, never recurse or touch user downloads.
    output.unlink(missing_ok=True)
    Path(str(output) + '.aria2').unlink(missing_ok=True)
    cmd = command(engine, f'http://127.0.0.1:{server.server_port}{key}', output)
    started = time.perf_counter()
    try:
        process = subprocess.run(cmd, capture_output=True, timeout=90)
        code = process.returncode
        log = (process.stdout + process.stderr).decode(errors='replace')[-3000:]
    except subprocess.TimeoutExpired:
        code, log = -1, 'timeout'
    elapsed = time.perf_counter() - started
    wait_idle(state)
    digest = hashlib.sha256(output.read_bytes()).hexdigest() if output.exists() else None
    row = dict(scenario=scenario, engine=engine, run=number, seconds=elapsed,
               exit_code=code, sha256_ok=digest == EXPECTED, server=dict(state), log=log)
    print(json.dumps({k:row[k] for k in ['scenario','engine','run','seconds','exit_code','sha256_ok']}), flush=True)
    output.unlink(missing_ok=True)
    Path(str(output) + '.aria2').unlink(missing_ok=True)
    return row


def restart(server, engine):
    key = '/restart-' + engine
    state = state_for(key, rate=2 * MIB)
    output = WORK / (key[1:] + '.bin')
    output.unlink(missing_ok=True)
    Path(str(output) + '.aria2').unlink(missing_ok=True)
    cmd = command(engine, f'http://127.0.0.1:{server.server_port}{key}', output)
    with (WORK / (engine + '-restart.log')).open('wb') as log:
        process = subprocess.Popen(cmd, stdout=log, stderr=log)
        try:
            time.sleep(2)
            process.kill()
            process.wait(timeout=10)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    wait_idle(state)
    before = state['sent']
    has_control = Path(str(output) + '.aria2').exists()
    started = time.perf_counter()
    result = subprocess.run(cmd, capture_output=True, timeout=90)
    elapsed = time.perf_counter() - started
    wait_idle(state)
    row = dict(engine=engine, killed_after_seconds=2, server_bytes_before_restart=before,
               server_bytes_after_restart=state['sent'] - before, seconds_after_restart=elapsed,
               aria2_control_file_present=has_control, exit_code=result.returncode,
               sha256_ok=hashlib.sha256(output.read_bytes()).hexdigest() == EXPECTED)
    print(json.dumps({'restart':row}), flush=True)
    output.unlink(missing_ok=True)
    Path(str(output) + '.aria2').unlink(missing_ok=True)
    return row


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    assert LABEEB.exists() and ARIA.exists(), 'Build adapter and fetch official aria2 first'
    server = BenchmarkServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    report = dict(environment=platform.platform(), server_accept_backlog=64, file_bytes=len(DATA), file_sha256=EXPECTED,
                  aria2_version=subprocess.check_output([str(ARIA),'--version']).decode().splitlines()[0],
                  production_source_sha256=hashlib.sha256((ROOT/'src-tauri/src/accelerator.rs').read_bytes()).hexdigest(),
                  limitations=['Loopback HTTP, not internet, TLS, browser integration, or real authenticated downloads.',
                               'Production accelerator called directly: native fallback and adaptive handover delay excluded.',
                               '32 MiB deterministic payload; timings include process startup and probe, not final SHA-256.',
                               'Per-connection cap is a synthetic favorable scenario for segmentation, not a global network cap.',
                               'Distinct default retry and segment scheduling policies retained.'],
                  warmup=[], runs=[], restart=[])
    def save():
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    try:
        for engine in ['labeeb-8', 'aria2-8']:
            report['warmup'].append(run_one(server, 'warmup_excluded', engine, 1))
        save()
        for scenario, config in [('uncapped', {}), ('per_connection_2MiBps', {'rate':2*MIB}),
                                 ('four_connection_drops', {'rate':2*MIB,'drops':4})]:
            engines = ['labeeb-8', 'aria2-8']
            if scenario == 'per_connection_2MiBps':
                engines.append('labeeb-1')
            for n in range(3):
                order = engines if n % 2 == 0 else list(reversed(engines))
                for engine in order:
                    report['runs'].append(run_one(server, scenario, engine, n+1, **config))
                    save()
        for engine in ['labeeb-8','aria2-8']:
            report['runs'].append(run_one(server,'no_ranges',engine,1,ranges=False))
            save()
            report['restart'].append(restart(server, engine))
            save()
        report['medians_seconds'] = {
            scenario: {engine: statistics.median(row['seconds'] for row in report['runs'] if row['scenario']==scenario and row['engine']==engine)
                       for engine in sorted({row['engine'] for row in report['runs'] if row['scenario']==scenario})}
            for scenario in sorted({row['scenario'] for row in report['runs']})}
        save()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
