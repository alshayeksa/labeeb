# Labeeb 0.1.9 — resource use and session recovery

## Changes

- Idle shell polling changes from 1.2 seconds to 10 seconds (50 to 6 requests per minute after initialization). Native navigation, title, zoom and download events are coalesced for prompt UI updates. Active loading, downloads and the visible automation preview retain 1.2-second polling. Periodic polling stops while the document is hidden; one final update stops the preview. Unchanged snapshot payloads do not replace React state.
- Library revisions omit unchanged history/bookmark arrays from IPC and avoid repeated SQL scans. AI credential presence is read once at startup and updated after save/delete, instead of reading the credential store every snapshot. Native bounds no longer react to every new tab object and unchanged bounds are skipped.
- Session metadata is saved with a 750-ms debounce and on exit. URL, title, order, selection and zoom are restored; only the selected nonblank tab allocates a native WebView. Other tabs load when selected. Blank tabs use the existing shell and allocate no child WebView. This does not restore page form contents or per-tab back/forward stacks. An abrupt crash can lose the last 750 ms of changes.
- Background WebViews use WebView2's LOW memory target and visible views return to NORMAL. This is a best-effort hint, not forced suspension; scripts and connections continue. See https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_19 . Memory savings vary by page and runtime.
- Automation screencasting is started on demand and stopped when its preview is hidden. The real sidecar lifecycle test exercises stop/restart. Obscura still starts only on explicit user request.
- Native navigation completion is matched to the latest navigation ID. An old completion cannot stop the current loading state; failed loads no longer enter history as successful visits. Diagnostic records remain available.
- Added Ctrl+F / toolbar search through WebView2's native find UI (requires a runtime with ICoreWebView2_28). Unsupported runtimes report an error. No injected page scripts are used for search.
- Downloads remain streamed to disk, publish progress at most four times per second, detect incomplete bodies, display failure reasons and allow explicit retry of failed/canceled downloads. Existing HTTPS/public-network/approval/size restrictions remain; authenticated cookie-dependent downloads and redirect handling are not expanded in this version.

## Validation

TypeScript and 46 frontend tests passed. A fake-clock test verifies exactly six steady-idle snapshot calls over a minute and zero periodic calls while hidden. Tests also cover coalescing 30 events into one refresh, preserving omitted library lists, requesting preview frames only in the automation section, Ctrl+F dispatch and explicit download retry.

All 20 Rust release tests passed, including session persistence/validation, library revision invalidation, stale navigation completion, diagnostic rotation and real sidecar preview stop/restart. Logs: performance-rust-tests.log and windows-0.1.9-build.log.

These are targeted workload reductions, not a Chrome/Edge performance comparison. No claim is made about total RAM or page-load speed versus other browsers. Native UI validation is recorded separately below when completed. The Windows installer remains unsigned; macOS and installation/uninstallation are not tested.

## Native Windows verification

Opened three deterministic local fixture pages (One, Two, Three), closed the test app and relaunched the final packaged executable. All three tab labels and the selected third tab were restored. The first two had the deferred-loading tooltip. The fixture request log contained exactly `/one`, `/two`, `/three`, `/three`: only the selected page reloaded after restart. The new diagnostic session recorded exactly one `observers_ready` event and one successful HTTP 200 navigation. Ctrl+F opened the native find bar; entering `needle` highlighted both matches and displayed `1/2` without blocking the shell. The final native find implementation returns after dispatch and logs asynchronous errors, avoiding a timeout while the user enters an empty initial query. Closed the three test tabs and left 0.1.9 at its start page.

Fixture requests are in performance-fixture-requests.jsonl. This is a lazy-loading check, not a network speed benchmark. Real download interruption/retry has not been exercised against a public server in this revision; the retry UI and streamed backend compile/tests were verified.
