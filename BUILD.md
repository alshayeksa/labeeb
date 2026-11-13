# Build and package

## Prerequisites

Node 22 LTS, npm, Python 3.12+, Rust stable and native platform tools. Windows requires MSVC C++/Windows SDK and WebView2; macOS requires Xcode command-line tools. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Linux is for development/protocol testing, not a claimed Windows/macOS build host.

## Source verification

```sh
npm ci
npm run check
npm test -- --run
npm run build
python scripts/package-sidecar-test.py
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
```

The no-default-features test excludes desktop integration. Native `cargo test` requires system libraries/tooling. Both lockfiles must be present and verified before a reproducible release claim.

`npm run dev` is UI-only; `npm run tauri -- dev` runs the native host. Preview cannot simulate native success. Source-only builds without a verified sidecar pin must show automation unavailable.

## Pinned sidecar

Run one matching target:

```sh
python scripts/package-sidecar.py --target x86_64-pc-windows-msvc
# or: aarch64-apple-darwin / x86_64-apple-darwin
```

The script checks the official v0.2.6 render/non-stealth archive SHA256 and writes `src-tauri/binaries/obscura-{target}[.exe]` plus `sidecar-manifest.json` containing target/version/executable SHA256. Build-time Rust checks the target and embeds the pin. Runtime resolves `obscura[.exe]` beside the host executable. For native dev, copy the prepared binary to the debug output directory under that unsuffixed name after preparation.

Only the main executable is needed for `serve --workers 1`. The release's `obscura-worker` is for scraping modes not exposed by this app. Do not use a no-render build or allow arbitrary user-selected executables as a workaround.

## Native bundles

On Windows x64:

```sh
npm run tauri -- build --target x86_64-pc-windows-msvc --config src-tauri/tauri.bundle.conf.json --bundles nsis
```

On Apple Silicon macOS:

```sh
npm run tauri -- build --target aarch64-apple-darwin --config src-tauri/tauri.bundle.conf.json --bundles app,dmg
```

Use x86_64-apple-darwin for Intel. Fetch and build target must match. Outputs belong under `src-tauri/target/{target}/release/bundle/`. The overlay adds the external binary; base config permits checks before download.

## Integrity and native smoke tests

```sh
python scripts/package-verify.py --root /path/to/extracted-or-installed-app --manifest src-tauri/binaries/sidecar-manifest.json
```

For macOS the bundle directory contains the `.app`; Windows installer contents must first be installed/extracted in a disposable test environment. Then launch on the target OS and exercise tabs, navigation, history/bookmarks, keychain, approvals, downloads, automation and exit cleanup. Record artifact hash, source commit, OS/architecture and results.

## Signing

Default workflow outputs unsigned candidates. Windows signing requires a configured certificate/service; macOS public distribution requires Developer ID and notarization. Credentials belong in a secret store, never source.

Sign the sidecar before computing its final embedded hash. Compile the host with that hash and bundle without further sidecar mutation. Verify after bundling; fail if the signer changed it. Do not disable hash checking. Verify Authenticode on Windows and codesign/spctl/notarization/stapling on macOS. Actual installed-app tests remain mandatory.

## CI and truthfulness

`.github/workflows/native-build.yml` is manual workflow_dispatch, read-only repository permissions, Windows x64 and two macOS architectures. It checks, fetches a pinned sidecar, builds native candidates and uploads artifacts without publishing a release. A workflow file is not a completed run. A frontend build, cross-target type check or renamed binary is not evidence of a genuine tested installer.

## Recovery note

The initial transient workspace was lost and these source files were reconstructed in the persistent workspace. Earlier checks apply only to their earlier bytes. Use the final TEST_PLAN/delivery record for rerun results; do not inherit a pass without rerunning the regenerated implementation.

## Experimental Linux → Windows NSIS packaging

This is an unsigned cross-build route, not a substitute for the native Windows CI or an installed-app smoke test. The `x86_64-pc-windows-gnu` link attempt with LLVM-MinGW failed because it expected GCC runtime libraries (`gcc`/`gcc_eh`). Use the matching `x86_64-pc-windows-gnullvm` Rust target with LLVM-MinGW instead. Compilation must finish successfully before packaging. See `docs/verification/windows-llvm-build.log` for the current attempt; a log path alone is not success evidence.

The installed Tauri CLI 2.12.4 supports calling Linux `makensis` for a Windows target, despite the host-specific help listing Linux formats. Its matching source removes `NSISDIR` and `NSISCONFDIR` before spawning `makensis`. A locally extracted NSIS therefore needs a wrapper, not merely an exported parent variable. Example for this workspace, after the binary and matching sidecar manifest are prepared:

```sh
TOOLS="$(cd ../.browser-build-tools && pwd)"
mkdir -p "$TOOLS/nsis-wrapper"
printf '#!/bin/sh\nexport NSISDIR="%s/nsis/usr/share/nsis"\nexec "%s/nsis/usr/bin/makensis" "$@"\n' "$TOOLS" "$TOOLS" > "$TOOLS/nsis-wrapper/makensis"
chmod +x "$TOOLS/nsis-wrapper/makensis"
export CARGO_HOME="$TOOLS/cargo" RUSTUP_HOME="$TOOLS/rustup"
export XDG_CACHE_HOME="$TOOLS/cache"
mkdir -p "$XDG_CACHE_HOME"
export PATH="$TOOLS/nsis-wrapper:$TOOLS/cargo/bin:$TOOLS/mingw/bin:$PATH"
# Bundle only; does not rebuild an unfinished/failed executable.
npm run tauri -- bundle --target x86_64-pc-windows-gnullvm \
  --config src-tauri/tauri.windows-cross.conf.json --bundles nsis --ci --no-sign
```

First confirm the sidecar filename and embedded manifest target match `x86_64-pc-windows-gnullvm`. The official Windows Obscura executable is the same release payload; do not silently alter its digest or bypass build-time target checks.

Inspect the resulting host executable with `llvm-readobj --coff-imports PATH_TO_EXE`. Any imported non-system DLL must be included and checked. In CLI 2.12.4 the automatic `WebView2Loader.dll` inclusion tests `target.ends_with("-gnu")`, which does **not** match `-gnullvm`; if the executable imports this loader, supply the correct x64 loader explicitly using a Tauri resource map that installs it beside the executable. Likewise inspect LLVM runtime DLL dependencies rather than assuming static linkage. Do not copy arbitrary DLLs from another machine. Windows system DLLs/API sets are provided by the OS and should not be redistributed blindly.

NSIS 3.11 from the local extraction was executable (`makensis -VERSION`). Tauri separately downloads its official `nsis_tauri_utils.dll` plugin and checks its pinned digest. Network/cache availability and that plugin are additional bundling dependencies. WiX/MSI is not the supported Linux route. Signing, installer extraction/integrity checks, real Windows launch, WebView2 bootstrap and uninstall tests remain separate requirements. Never infer an installer exists merely from a zero CLI exit status; inspect the artifact and complete output.

### Windows Obscura runtime prerequisite

Import-table inspection of the official Windows Obscura executable found `VCRUNTIME140.dll` and `VCRUNTIME140_1.dll`, in addition to UCRT dependencies. The upstream ZIP does not contain these DLLs. Windows users must install the official [Microsoft Visual C++ 2015–2022 x64 Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe) before starting automation. Use Microsoft's installer rather than downloading individual DLLs from third-party sites.

**Candidate packaging gap:** this project's installer does not currently bundle, detect or install that redistributable. It has not been installed or verified on a real Windows system during this build. A successful installer build alone does not establish that Obscura can start on a clean Windows machine. Validate this prerequisite and sidecar startup in the Windows smoke test before distribution. Host-executable runtime dependencies must be inspected separately.

### Cross-build loader preparation

The reconstructed gnullvm host successfully linked to a Windows PE executable. Import inspection identified `WebView2Loader.dll` as its non-system dependency. Before the cross-bundle command above, copy the **x64** loader from the official `webview2-com-sys` crate build output into `src-tauri/binaries/WebView2Loader.dll`. The cross-only `tauri.windows-cross.conf.json` overlay maps it to the install directory beside the executable. Do not select the x86 or arm64 loader merely because it is the first search result.

```sh
find src-tauri/target/x86_64-pc-windows-gnullvm/release/build \
  -path '*/out/x64/WebView2Loader.dll' -print
# Inspect the matching crate build output, then copy its exact path:
cp /EXACT/CRATE/BUILD/out/x64/WebView2Loader.dll src-tauri/binaries/WebView2Loader.dll
```

The first bundling attempt reached the verified NSIS plugin download but failed with `Read-only file system (os error 30)`. Set `XDG_CACHE_HOME` to a writable directory as shown above: Tauri's NSIS tooling uses the user cache, not a required system-directory installation. This preparation does not establish successful installer creation.
