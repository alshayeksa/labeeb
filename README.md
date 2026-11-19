# لبيب | Labeeb

Arabic-first Windows/macOS desktop browser using Tauri 2, React, TypeScript, Rust and local Tajawal fonts. The language switch is beside the logo.

Daily browsing uses native WebView2/WKWebView. The application includes an AI chat assistant and media downloads.

This source implementation is under verification, **not a certified production-ready release**. A frontend build is not an installer. The build and verification records distinguish actual results from pending platform gates.

- [جرّب نسخة Windows خطوة بخطوة](TRY_WINDOWS_AR.md)
- [Build and package](BUILD.md)
- [دليل بناء نسخة الماك](BUILD_MACOS_AR.md)
- [Architecture](ARCHITECTURE.md)
- [Compatibility limits](COMPATIBILITY.md)
- [Security](SECURITY.md)
- [Tests and release gates](TEST_PLAN.md)
- [Current release status](RELEASE_STATUS.md)

```sh
npm ci
npm run check
npm test -- --run
npm run build
```

`npm run dev` is UI-only development and cannot create native tabs, access the keychain or perform native operations. It deliberately does not simulate successful native operations. Use the native build instructions for those features.

Source license: Apache-2.0. See LICENSE and THIRD_PARTY_NOTICES.md. No API keys, signing credentials or personal browser data are included.
