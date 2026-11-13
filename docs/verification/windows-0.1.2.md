# Windows 0.1.2 verification — 2026-11-13

## Changes

- Restore the selected tab's actual address when switching between tabs with identical URLs; preserve an in-progress edit during ordinary snapshot refreshes.
- Show a lock only for HTTPS. HTTP and blank pages have separate localized connection labels.
- Restart a stopped/faulted automation instance and invalidate its approvals before launching the replacement.
- Handle Obscura's Windows authentication-denial connection resets. Anonymous and wrong-token requests must be rejected; the actual launch token must succeed. Connection failures and timeouts fail verification.
- Make the CDP test harness retain Windows SYSTEMROOT regardless of environment-variable casing, bypass proxies for loopback, and recognize connection-reset denial.

## Verification

- Frontend: 25 tests passed, TypeScript check and production build passed (`windows-fixes-frontend.log`).
- Packaging parser: 4 tests passed.
- Windows Obscura protocol: 9 checks passed (`windows-fixes-cdp.json`), including authentication rejection, Arabic input, mouse hit testing and JPEG screencast.
- Rust: all 14 release-mode tests passed on Windows, including the real-sidecar lifecycle and authentication probes (`windows-fixes-rust.log`). Rustfmt check passed.
- Native build: Windows x64/MSVC release 0.1.2 and NSIS installer succeeded (`windows-fixes-build.log`).
- Portable application: launched successfully on this Windows host; Arabic shell and backend-ready state observed through Windows accessibility and screenshot. UI testing stopped when the user began interacting with the window, which was left open. Native tab interaction and fault/restart via the UI were not completed.
- Portable sidecar hash verified against the build manifest. Delivery hashes are in `windows-fixes-artifacts.json`.
- NSIS install/uninstall, clean-machine prerequisite installation, macOS, signing and live AI requests were not tested.

No AI API key or signed release certificate was used. These checks do not certify all website behavior or production readiness.
