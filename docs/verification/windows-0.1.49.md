# Windows 0.1.49 - Viora token compatibility fix

## Cause and change
The 0.1.48 opaque-origin helper reached GenerateIT but received no usable integrity token. Reproduced against live YouTube in a clean Chromium profile. A separate hostname also failed; retaining www.youtube.com with a separate port successfully minted tokens. The interface stays on HTTPS port 443 and the helper runs on port 444, which is a different browser origin.

The helper retains its sandbox, restrictive CSP, bounded MessageChannel broker, credential-free attestation requests, argument parsing and cleanup. It receives no store token or privileged bridge. The parent sends initialization only to the exact helper origin; the helper accepts it only from its parent at the exact interface origin. Origin-Agent-Cluster prevents document.domain relaxation. Cookies are not origin-separated by ports; this uses the existing separate Viora profile, whose cookies are cleared on mount, and the app's requests omit credentials. The native store does not use cookies.

The native host intercepts every request on the helper origin and serves exactly token-helper.html and token-helper.js for GET. It never serves the interface, bridge, or store there, even with the correct store token. The helper origin is virtual; no server listens on port 444.

A first native probe exposed a second issue: WebView2's legacy request filter serves the cross-origin frame document but omits its script. Replaced it with ICoreWebView2_22.AddWebResourceRequestedFilterWithRequestSourceKinds, including all request sources. See [Microsoft's API documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_22).

## Verification
- Offline Chromium regression: parent bridge, parent storage, document.domain relaxation, interface-document reads and store writes blocked; both allowlisted attestation endpoints work; malformed argument injection rejected; cleanup and retry pass. Uses synthetic data and intercepted traffic only.
- Native host tests: 3 passed, including denial of helper-origin store/bridge/index access, traversal, unexpected methods and extra query strings.
- Live Chromium: tokens minted and media reached readyState 4.
- Native live WebView2 playback probe: PASS. One token minted, no token error, video readyState 4, currentTime 0.246387 at readiness and time advanced after play(). Exit code 0. Chromium emitted an unregister-window-class message on shutdown; assertions passed.

The native probe uses a temporary WebView2 profile and SQLite database, loads an actual public video and requires time to advance after playback. Build the Cargo example viora_playback_probe with the same Common Controls v6 manifest flags documented for site_data_probe in the previous release record.

No existing user profile was modified. No Store upload or publication was performed. macOS was not tested.
