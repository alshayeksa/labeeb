# Test plan and evidence

Report each gate as passed, failed or not run. Source inspection is not runtime evidence; frontend success is not native packaging.

## 0.1.3 About page (latest)

See [the 0.1.3 verification record](docs/verification/windows-0.1.3.md). TypeScript, 26 frontend tests, Windows native build/NSIS packaging and visual inspection of the Arabic About page passed. Backend behavior is unchanged from 0.1.2; its checks were not rerun. Older sections are historical evidence.

## 0.1.2 Windows fixes (latest)

See [the 0.1.2 verification record](docs/verification/windows-0.1.2.md). This run passed 25 frontend tests, 14 native Rust tests (including the real sidecar), 9 Windows CDP checks and 4 packaging tests. Native MSVC release/NSIS packaging and portable launch passed. Full UI interaction, installer install/uninstall, signing and clean-machine checks remain unverified. The sections below are historical records.

## 0.1.1 trial with approved logo (latest)
- The supplied Labeeb artwork was integrated in the shell/start page and converted with the official Tauri icon command for platform icons.
- `trial-frontend.log`: TypeScript + 21 tests + production build passed; full npm audit reported zero vulnerabilities.
- `trial-core.log`: rustfmt and 12 core tests passed (one live test ignored by the ordinary suite). The real adapter and CDP had passed the immediately preceding branding run; no adapter code changed.
- `trial-windows-build.log` and `trial-windows-bundle.log`: genuine x64 executable and unsigned NSIS 0.1.1 installer built successfully.
- `trial-extraction.log` and `trial-artifact-integrity.json`: extracted sidecar/loader match their inputs; host matches with only the expected NSIS marker change.
- `trial-windows-host.md`: real Windows prerequisite check passed, but automatic file transfer failed before app launch. Native launch/UI/install/uninstall remains untested.
- `TRY_WINDOWS_AR.md` contains practical trial steps, prerequisites and safety limits. No macOS build or signing success is claimed.

## Labeeb branding verification (latest)

The user adopted **لبيب | Labeeb**. UI strings, native window title, Cargo/npm package names, application/keychain identity and installer naming were updated without functional changes. Prior-name logs below are historical evidence, not the new artifact identity.

- `labeeb-frontend.log`: TypeScript, 21 tests, production build and npm audit passed; zero reported npm vulnerabilities.
- `labeeb-core.log`: rustfmt, 12 core tests, 4 packaging tests, and an explicitly run real-sidecar lifecycle test passed.
- `labeeb-cdp.json`: all eight real Linux CDP checks rerun successfully.
- `labeeb-branding.log`: Arabic/English brand, native title, product config and built HTML verified.
- `labeeb-windows-build.log`: renamed Windows release cross-build succeeded. Final installer extraction/integrity result is recorded in `labeeb-artifact-integrity.json`.
- Native Windows launch, macOS builds, signatures and notarization remain unverified. Changing the app/keychain identifier does not migrate old-name data or credentials.

## Current reconstruction evidence

The initial transient workspace was lost; these checks were rerun on the reconstructed implementation in the persistent workspace.

- **Core Rust: passed.** `docs/verification/core.log`, 2026-11-13 04:20 UTC, Rust 1.100.0. Twelve core tests passed; one real-sidecar test was initially ignored by the ordinary suite and then explicitly run separately and passed. These are policy/storage/adapter tests, not native UI tests.
- **Actual Obscura protocol fixture: passed.** `docs/verification/cdp.json`, 2026-11-13 04:20 UTC, Linux x86_64, official v0.2.6 binary SHA256 `c1400eec0b1572ea9b583b1544feafb0b25cea4e155b353dbba9c144d94ae6e3`. Eight recorded checks cover readiness PID/loopback, anonymous HTTP/WebSocket rejection, frame identity, Arabic insertion, key mutation, mouse hit test and JPEG screencast acknowledgement. This does not establish Windows/macOS runtime behavior.
- **Packaging parser: passed, 4 tests.** `docs/verification/packaging-tests.log`. Expected ZIP entry, duplicate rejection, tar symlink rejection and regular tar entry. Reconstructed Python syntax and workflow YAML parsing also passed.
- **Windows release cross-build and NSIS packaging: passed.** Initial GNU/LLVM mismatch failed in `windows-build.log`; corrected `x86_64-pc-windows-gnullvm` release and forced final-assets rebuild passed in `windows-llvm-build.log`. `windows-bundle.log` records a real 31.08 MiB NSIS installer. Extraction passed; loader and sidecar hashes match, and host bytes match except the expected three-byte Tauri NSIS bundle-type marker (`artifact-integrity.json`). This is an unsigned candidate, not an installed-app pass.
- **Frontend: passed.** `docs/verification/frontend.log`: TypeScript check, 21 tests, production build, full npm audit with 0 reported vulnerabilities. `FRONTEND_IPC.md` records source-level parity across 20 commands. Native visual tests were not possible.
- **macOS native build, Windows/macOS installed-app tests, signing and notarization:** not established by this record.

## Commands

```sh
npm run check
npm test -- --run
npm run build
python scripts/package-sidecar-test.py
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
cargo test --locked --manifest-path src-tauri/Cargo.toml
python scripts/verify-obscura.py /path/to/obscura
```

The last command requires the sidecar verification harness and its documented dependencies. It is a real protocol fixture, not an implementation demo. See docs/UPSTREAM_AUDIT.md for pinned API/source evidence and exact rerun status.

## Native gates per OS/architecture

1. Cold start/database/keychain failure behavior.
2. Arabic RTL and English LTR, mixed text/URLs, persistence and keyboard accessibility.
3. Real navigation/back/forward/stop/reload; create/switch/close 10 tabs and close final tab.
4. Real title/loading events, correct history dates and bookmark deduplication.
5. Resize/maximize/DPI and native content bounds; approval dialogs never covered.
6. Key save/delete and actual AI request; no key in snapshots/logs/storage/pages.
7. Real sidecar start, approved navigation, genuine screencast and verified input effects.
8. Stop/quit/restart/crash leaves no orphan or reusable stale approval.

## Negative and security tests

- Deny, expiry, duplicate resolution, page navigation and visual changes between approval and action.
- Page prompt injection and direct remote/subframe IPC attempts.
- Invalid schemes/credentials/URLs/IDs, unsupported input and huge payloads.
- Missing/tampered binary, wrong target pin, wrong PID/nonloopback readiness.
- Missing/wrong bearer token, foreign Origin, stalled/oversized CDP response.
- Uncertain input result is not automatically repeated.
- Download non-HTTPS/private IP/redirect/session auth, invalid filenames, existing files, missing size, oversized body, cancellation before byte one and during a stall, partial cleanup.
- AI response bounds before allocation and keychain errors without plaintext fallback.

## Release record

For every installer/app/DMG retain exact commit and lock hashes, host OS/toolchain/architecture, sidecar pin, artifact SHA256, install/uninstall/launch results, native smoke results, signing verification and notarization state. Unsigned candidates must be labeled unsigned. No production-readiness claim before native gates and independent security review pass.

## Final source checks

`docs/verification/final-checks.log`: rustfmt check, 12 core Rust tests (one separately verified live test ignored in ordinary suite), and 4 packaging tests passed after integration. Final frontend assets were forcibly rebuilt into the host.
