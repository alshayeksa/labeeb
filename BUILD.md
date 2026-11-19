# Build and package

## Prerequisites

Node 22, npm, Python 3.12+, Rust stable and native platform tools. Windows requires MSVC C++/Windows SDK and WebView2; macOS requires Xcode command-line tools. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

The bundle configuration includes `viora-tauri/app` and `viora-tauri/shim`. Prepare these resource directories before packaging and retain Viora's license and corresponding source. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Source verification

```sh
npm ci
npm run check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
```

`npm run check` includes TypeScript and frontend tests. The Rust command above excludes desktop integration; native tests require platform tooling. `npm run dev` is UI-only; `npm run tauri -- dev` runs the native host.

## Windows x64 package

From PowerShell with Rust on PATH:

```powershell
npm.cmd run tauri -- build --target x86_64-pc-windows-msvc --config src-tauri/tauri.bundle.conf.json --bundles nsis
python scripts/package.py
```

Inspect the generated installer, portable directory, ZIP and hashes in `artifacts/`. Keep the portable package resources beside the executable. Test the installed application separately from compilation.

## macOS and signing

For the Arabic macOS build, packaging, signing, and verification guide, see [دليل بناء لبيب على الماك](BUILD_MACOS_AR.md).

For a Windows Microsoft Store draft, use the separate [MSIX packaging workflow](packaging/STORE.md). This preserves the existing native browser architecture and does not publish the application.

Build each macOS architecture on the appropriate native toolchain using the bundle configuration. No verified macOS package is included in the current delivery.

Current Windows artifacts are unsigned. Windows signing requires a configured certificate/service; macOS public distribution requires Developer ID and notarization. Keep credentials outside source. Verify signatures and perform installed-app tests before public distribution.

## CI

`.github/workflows/native-build.yml` runs manually, on pushes to `main`, and on pull requests, with read-only repository permissions. It checks and builds Windows x64 and two macOS architecture targets and uploads artifacts without publishing a release. Its existence does not prove a successful run. See [release status](RELEASE_STATUS.md) and [test plan](TEST_PLAN.md).
