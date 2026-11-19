> Historical archive: this audit covers a component removed from the current application. It is not a current feature list or build guide. See [current release status](../RELEASE_STATUS.md).

# Obscura audit and integration evidence

Audit: 2026-11-12; recovered after workspace restart 2026-11-13. Evidence below distinguishes upstream source inspection, executed Linux release tests, and unverified platform behavior. It is not Chromium conformance or production certification.

## Inspected upstream

Repository: <https://github.com/h4ckf0r0day/obscura>

- Source commit `3bae60909615ed5a2ca263a12c300a4a545ed3ce` (2026-11-11).
- Release target: `v0.2.6`, tag commit `f3765e183b2570e7532519f1cdabf4354e911322`, published 2026-10-31. GitHub API's latest three releases were inspected.
- Read `README.md`, `AGENTS.md`, workspace `Cargo.toml`, CLI/CDP crate manifests, CLI main and release workflow, CDP authentication/readiness/dispatch, target/session handling, input and page domains, and architecture/Puppeteer/Playwright/render documentation.
- No upstream source was modified. Upstream's required nextest/obstacle-course gates were not run; no full conformance claim is made.

Workspace crates: `obscura-cli` supplies serve/fetch/scrape/mcp and worker process; `obscura-cdp` supplies HTTP/WebSocket CDP; `obscura-browser` owns Page/navigation/interception; `obscura-js` owns V8/shims; `obscura-dom` the DOM; `obscura-net` network/cookies; `obscura-ssrf` private-network validation; `obscura-render` CPU layout/paint/capture; `obscura-mcp` MCP; `obscura` embeddable library.

## Architectural conclusion

Obscura is a Rust headless automation engine with V8, its own DOM/render pipeline and CDP compatibility. It is **not Chromium or a complete daily-browser replacement**. Its version endpoint reports a Chrome-shaped compatibility identifier, not proof of embedded Chrome.

Use WebView2 for Windows daily browsing and WKWebView for macOS. Obscura is a separately labeled automation context, with no silent transfer of native tabs' cookies, passwords, sessions or history.

## Verified transport contract

```
obscura serve --host 127.0.0.1 --port 0 --workers 1 --max-connections 2 --ready-file <runtime-file> --quiet
```

- `OBSCURA_CDP_TOKEN`: upstream enforces minimum 32 bytes; app generates 64 hex characters from fresh UUID v4 entropy. Passed only in child environment, never frontend, URL or command line.
- Readiness JSON: PID, host, allocated port, `/devtools/browser` path. App validates exact launched PID, loopback host and path.
- Auth: `Authorization: Bearer …` for HTTP and WebSocket. App first requires anonymous HTTP 401, then authenticated success, then native authenticated WS handshake.
- Upstream checks Host and Origin. App never enables broad origins, file access, private network, proxies or inherited CDP settings.
- Targets belong to the creating connection. Separate connections cannot simply attach to another connection's targets.
- One worker runs CDP in-process. Explicit stop kills and waits; kill-on-drop is the backstop. Errors/timeouts fault the session, with no automatic retry of potentially completed input.
- Same-OS-user compromise remains outside bearer protection: that attacker may inspect process memory/environment.

## Actual API surface

The native client uses `Target.createTarget`, `Target.attachToTarget` with flatten, `Page.enable`, `Emulation.setDeviceMetricsOverride`, `Page.navigate`, `Page.getFrameTree`, `Page.captureScreenshot`, `Page.startScreencast`, `Page.screencastFrameAck`, `Input.dispatchMouseEvent`, `Input.insertText`, `Input.dispatchKeyEvent`, and a **fixed** bounded `Runtime.evaluate` body-text expression.

No frontend generic CDP, arbitrary JavaScript, endpoint, token, file path, or shell command is exposed. Product navigation permits only HTTP(S) without URL credentials; controller further restricts automation as documented in its policy.

Screencasts are activity-driven JPEG frames, not guaranteed video FPS. Render builds are required. Incoming image/message size limits and JPEG signatures are checked. Frame acks use inner numeric frame sessionId and outer target CDP sessionId.

All input is potentially consequential: every click, key, text insertion or wheel event is one-shot approved in the controller. Pending approval includes exact input, URL, navigation epoch and fresh PNG screenshot hash. A new screenshot and identity query immediately before execution reject changed pages, reloads or pixels. Animations may conservatively invalidate approvals. This is **not** proof against invisible handler changes or a page mutation after capture; there is no transactional website action API.

## Executed Linux release tests

Official non-stealth render archive `obscura-x86_64-linux.tar.gz`, v0.2.6, was downloaded and run. Executable SHA-256:

`c1400eec0b1572ea9b583b1544feafb0b25cea4e155b353dbba9c144d94ae6e3`

`python scripts/verify-obscura.py /path/to/obscura` passed:

1. Readiness PID and loopback identity.
2. Anonymous HTTP denied 401.
3. Anonymous WebSocket denied 401.
4. Authenticated create/attach and native frame identity query.
5. Arabic insertText actually changed input value to `مرحبا`.
6. Keyboard event with text actually changed the input.
7. Coordinate mouse press/release activated the expected button handler.
8. Actual JPEG screencast (9,334-byte fixture frame), ack and stop.

The test's data URL is only a deterministic local fixture. Product navigation rejects data URLs. The fixture does not establish visual fidelity, complete IME support, arbitrary websites or all key behaviors.

The in-tree Rust `automation::tests::real_sidecar_lifecycle` was explicitly run and passed against that same Linux executable: pinned launch/auth/session, text extraction, actual screencast, fresh PNG approval fingerprint stability, file URL rejection, stop and readiness cleanup. The core test suite had 9 passing tests and 1 explicitly ignored integration test; the integration was then explicitly run and passed separately.

```
OBSCURA_TEST_BIN=/absolute/path/to/obscura \
OBSCURA_TEST_SHA256=c1400eec0b1572ea9b583b1544feafb0b25cea4e155b353dbba9c144d94ae6e3 \
cargo test --no-default-features real_sidecar_lifecycle -- --ignored --nocapture
```

The digest above is for the Linux executable, not its archive or another platform. Use the matching verified platform manifest. An ignored test is not a pass. After recovery of source files, rerun checks before treating recovered code as verified.

## Release/platform evidence

v0.2.6 publishes render/non-render and stealth/non-stealth packages for Windows x64, macOS x64/arm64 and Linux x64/arm64. Use render non-stealth. No-render packages cannot provide screencast.

The official non-stealth Windows archive was listed and contains `obscura.exe` and `obscura-worker.exe`, without DLLs. Preserve both; do not assume later/source variants have identical dependencies. Upstream CI builds each macOS architecture natively because V8 snapshots are architecture-specific. Renaming a Linux executable never produces a Windows or macOS artifact.

## Known compatibility limits

Inspected upstream docs state incomplete service workers, native media playback, some Web APIs, long-tail CSS/compositor behavior, iframe content compositing gaps, no WebGL renderer, raster-backed PDFs without selectable text/tagged PDF, and limited live DOM mutation events. Source snapshot improvements may postdate the release; only explicit release test claims above are runtime verified.

Do not promise DRM, conferencing, extensions, full DevTools parity, anti-bot bypass or Chromium-equivalent compatibility. Keep daily browsing on the native engine.

## Unverified release gates

Windows/macOS sidecar execution; both macOS architectures; real native browser integration; app approvals/session isolation; crash/restart behavior in packaged app; accessibility and native Arabic input; OS keychain behavior; installers/app bundles installation and launch; signing/notarization; representative website coverage. No successful Windows/macOS build or production-readiness claim follows from Linux tests.

### Post-recovery verification, 2026-11-13

Recovered code was recompiled and re-tested with Rust 1.100.0 on Linux. The current core suite passed **12 tests**, with its sidecar integration test ignored by default; that integration test was then explicitly executed and **passed**. The Python CDP contract check was re-run successfully against the newly downloaded executable with the same verified SHA-256. Machine-readable evidence: `docs/verification/core.log` and `docs/verification/cdp.json`. These replace the earlier workspace-only test evidence for the recovered files.
