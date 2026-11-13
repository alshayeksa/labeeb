# لبيب | Labeeb

Arabic-first Windows/macOS desktop browser using Tauri 2, React, TypeScript, Rust and local Tajawal fonts. English is available in Settings.

Daily browsing uses native WebView2/WKWebView. Obscura is a separately managed automation engine, not a complete Chromium replacement. Native browsing and automation do not share cookies or login sessions.

This source implementation is under verification, **not a certified production-ready release**. A frontend build is not an installer. The build and verification records distinguish actual results from pending platform gates.

- [جرّب نسخة Windows خطوة بخطوة](TRY_WINDOWS_AR.md)
- [Build and package](BUILD.md)
- [Architecture](ARCHITECTURE.md)
- [Compatibility limits](COMPATIBILITY.md)
- [Security](SECURITY.md)
- [Tests and release gates](TEST_PLAN.md)
- [Upstream audit](docs/UPSTREAM_AUDIT.md)

```sh
npm ci
npm run check
npm test -- --run
npm run build
```

`npm run dev` is UI-only development and cannot create native tabs, access the keychain or run Obscura. It deliberately does not simulate successful native operations. Use the native build instructions for those features.

Source license: Apache-2.0. See LICENSE and THIRD_PARTY_NOTICES.md. No API keys, signing credentials or personal browser data are included.
