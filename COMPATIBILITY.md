# Compatibility

| Target | Daily browser | Automation asset | Package |
|---|---|---|---|
| Windows x64 | WebView2 | Obscura v0.2.6 x64 render | NSIS executable |
| macOS Apple Silicon | WKWebView | v0.2.6 arm64 render | app and DMG |
| macOS Intel | WKWebView | v0.2.6 x64 render | app and DMG |
| Linux | Development only | Protocol fixture validation | No requested end-user package |

Asset existence is not runtime verification. Final build records must identify which targets were actually compiled, launched and tested. Never rename a Linux binary as a Windows/macOS artifact.

## Boundaries

- Obscura is not Chromium. Its CDP and rendering are a subset, not blanket Puppeteer/Playwright or website compatibility.
- Native tabs and Obscura automation have separate sessions/cookies.
- No extension ecosystem, Chrome profile import, password manager, DRM or video-conferencing compatibility claim.
- No general IME, drag/drop, file upload, cross-origin frame or Web API completeness claim from a few input tests.
- No arbitrary CDP/eval bridge to the shell, model or remote page.
- Coordinate approval cannot infer a purchase/message/form's meaning. The person must inspect the live context. A dynamic site can change after a screenshot.
- Approval controls cover app/AI-dispatched operations, not universal interception of manual native-page forms/scripts/file pickers. An all-page transaction policy requires additional verified interception.
- Host downloads are restricted to public HTTPS, do not inherit webview session cookies and do not automatically follow redirects. Authenticated or redirecting downloads can fail intentionally.
- No antivirus/file reputation service or automatic file execution.
- SQLite/native browser data are not claimed encrypted at rest.
- Source UI preview is not a substitute for native functionality.
- macOS universal distribution is not produced by pairing a universal shell with a single-architecture sidecar. Build targets separately.

Sources: [Obscura](https://github.com/h4ckf0r0day/obscura), [v0.2.6](https://github.com/h4ckf0r0day/obscura/releases/tag/v0.2.6), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [capabilities](https://v2.tauri.app/security/capabilities/), [sidecars](https://v2.tauri.app/develop/sidecar/).

## Windows sidecar runtime dependency

The official Obscura Windows executable imports `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll` (plus UCRT). Its release ZIP supplies no runtime DLLs. Install the official [Microsoft Visual C++ 2015–2022 x64 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) before using automation. This prerequisite is **not bundled or automatically installed/detected** by the current candidate installer. Clean-machine startup remains unverified; native browsing and Obscura have separate dependency requirements. Do not interpret an installer artifact as evidence that these prerequisites are present.
