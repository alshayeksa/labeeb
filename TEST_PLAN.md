# Test plan and evidence

Current version: **0.1.17**. Report each check as passed, failed or not run. Source inspection and frontend tests do not establish native runtime behavior.

## Recorded evidence

- [0.1.17 verification](docs/verification/windows-0.1.17.md): TypeScript, 70 frontend tests and production frontend build passed; native interactive visual inspection was not performed.
- [Artifact record](docs/verification/windows-0.1.17-artifacts.json): current Windows package metadata.
- [Modern web review](docs/verification/modern-web-review.md): scoped UI measurements and limitations.
- [Downloader comparison](docs/verification/download-comparison.md): reproducible local benchmark, conditions and limitations.

Older records in `docs/verification/` apply to their recorded versions, not automatically to current source.

## Commands

```sh
npm run check
npm run build
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Native Rust tests require platform tooling. Benchmark rerun prerequisites and commands are documented in their linked records.

## Native gates per supported OS/architecture

1. Cold start, persistence, database errors and keychain failure behavior.
2. Arabic RTL/English LTR, mixed text/URLs, Tajawal, keyboard navigation, focus and accessible labels.
3. Navigation, back/forward, stop/reload, create/switch/close tabs, final-tab behavior and session restoration.
4. Address suggestions, bookmarks, history clearing confirmation, search, zoom and shortcuts.
5. Resize, maximize, DPI and native content bounds; dialogs must stay above page content.
6. Assistant requests, key save/delete, panel close/reopen, preserved draft and expanded page bounds.
7. Native file downloads, authenticated/redirect/blob cases, range/no-range fallback, cancellation, retry and safe destinations.
8. Media tools, video/audio download queue, library persistence, thumbnails, playback and folder opening.
9. Viora opening, separate profile and packaged resource availability.
10. Clean-machine installation, upgrade, uninstall, exit/crash cleanup and portable launch.

## Security and release gates

- Remote pages and subframes cannot invoke privileged IPC commands.
- Invalid navigation schemes, credential-bearing URLs and malformed IDs/payloads are rejected.
- Keys never appear in snapshots, logs or frontend persistence; no plaintext fallback after keychain failure.
- Direct media URL restrictions are tested separately from native browser download behavior.
- Downloads never execute automatically, overwrite silently or remove unrelated files; cancellation handles stalled connections.
- Missing or tampered media tools fail integrity checks.
- Exact dependency/license inventory, artifact hashes and signature verification are recorded.

For each release record the commit, lockfile hashes, toolchain, OS/architecture, build results and native checks. Current unsigned Windows packages and unverified macOS targets retain the limits described in [release status](RELEASE_STATUS.md).
