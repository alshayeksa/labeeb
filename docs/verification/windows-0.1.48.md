# Windows 0.1.48 — security remediation

## Changes
- Viora's remote interpreter runs in an opaque-origin iframe (`sandbox="allow-scripts"`, no `allow-same-origin`). Its CSP denies direct network connections, child frames, forms and objects. A transferred MessageChannel accepts only bounded token results and up to eight POST requests to the two exact YouTube attestation endpoints. Requests omit credentials, reject redirects, restrict headers, and cap body/response sizes. The helper receives no storage token or database bridge. JSON arguments are parsed as data, not interpolated into executable code. Timeout/error cleanup removes the helper and cancels pending requests.
- Site-data clearing now awaits WebView2's actual completion callback and includes Viora's separate persistent profile. An invisible blank view opens the actual profile directory solely to clear it and is closed afterwards, regardless of whether a Viora tab is open. Native SQLite history/bookmarks/vault remain outside this operation.
- The standalone prototype now uses rusqlite 0.41.1 / libsqlite3-sys 0.39.1, matching the main application's SQLite security update.
- This package also includes the previously source-only download referrer/redirect and Windows Internet-zone fixes, and the main application's ZIP/SQLite updates.

## Verification
- TypeScript and frontend tests: 166 passed, one skipped.
- Native library: 51 passed, four explicitly ignored.
- Prototype persistence/path tests: two passed.
- Fresh prototype RustSec audit: no vulnerability entries; two informational cross-platform dependency warnings (proc-macro-error, glib) remain.
- `scripts/security-viora-test.mjs`: offline Chromium fixture uses the actual bridge/helper files and synthetic remote interpreter. Parent bridge access, token-document reads and store calls are blocked; both allowed attestation routes work. Executable argument injection is rejected, cleanup and retry work. All traffic is intercepted; no account or real user data is used.
- `examples/site_data_probe.rs`: real Windows WebView2 test with two temporary profiles. Synthetic cookies/localStorage are written and both live profiles are cleared. The test then writes markers again, closes the isolated tab, clears both profiles, and reopens the isolated profile. Both profiles contain neither marker in both cases. PASS.
- Native probe requires the Windows Common Controls v6 manifest when linked as a Cargo example. Initial runs without it failed to load; adding the manifest produced a passing run. This does not affect the normal Tauri application's manifest.

## Reproduction and limits
Run the browser fixture with `LABEEB_CHROMIUM` pointing to an installed Chromium and `LABEEB_PLAYWRIGHT_MODULE` pointing to Playwright if the local QA installation is absent.
Build the native probe with Cargo `rustc --example site_data_probe --release --target x86_64-pc-windows-msvc`, passing linker `/MANIFEST:EMBED` and `/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'`, then run the resulting example executable.

Live YouTube attestation/playback has not been validated with the new opaque helper. Google's remote interpreter may impose additional environment requirements; there is deliberately no fallback to the unsafe same-origin helper. macOS behavior was not exercised. Microsoft Store package is unsigned for Partner Center ingestion; nothing was uploaded or published.
