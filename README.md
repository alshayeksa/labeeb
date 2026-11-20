# لبيب | Labeeb

**Website:** https://labeeb.alshaye.ai/en/

## Download

| Platform | Download |
| --- | --- |
| Windows | [Get it from Microsoft Store](https://apps.microsoft.com/detail/9N7MHHW7XG45?hl=en-us&gl=SA&ocid=pdpshare) |
| macOS (Apple Silicon: M1 and later) | [Labeeb_0.1.51_aarch64.dmg](https://labeeb.alshaye.ai/downloads/Labeeb_0.1.51_aarch64.dmg) |
| macOS (Intel) | [Labeeb_0.1.51_x64.dmg](https://labeeb.alshaye.ai/downloads/Labeeb_0.1.51_x64.dmg) |

The macOS builds are signed with a Developer ID certificate, notarized by Apple and require macOS 12 or later. To check which Mac you have, open the Apple menu and choose **About This Mac**.

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
