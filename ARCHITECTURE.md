# Architecture

## Surfaces and trust

The trusted local Tauri shell renders React controls, Arabic RTL/English LTR, history/bookmarks, downloads, settings, chat and approvals. Fonts are bundled locally. Remote pages run in separate native child webviews, with no matching IPC capability. Rust manages tab identity, lifecycle, bounds and visibility so native content does not obscure trusted controls.

Windows uses WebView2 and macOS uses WKWebView for daily browsing. Obscura has its own Rust/V8/DOM/rendering implementation and is used only for the separate supervised automation workspace. It does not silently inherit native browser sessions.

## Backend ownership

Rust owns SQLite, OS-keychain credentials, download destinations, AI network calls, approval state, process startup and CDP. The frontend has named commands, not arbitrary shell execution, JavaScript evaluation, executable paths or raw CDP methods. Remote content is data, never an authority to approve actions.

SQLite stores history, bookmarks and nonsecret settings with parameterized queries, schema versioning and retention limits. It is not encrypted. Native webview storage is separate; clearing history does not erase cookies, caches, saved credentials or downloads.

## Sidecar lifecycle

Packaging downloads the pinned render-enabled non-stealth Obscura v0.2.6 asset for the exact target. The archive digest is checked before reading executable bytes. Build-time code embeds the extracted executable hash. Runtime only starts the bundled executable after integrity verification.

The sidecar is launched with a new bearer token, loopback-only ephemeral port and readiness file. Rust validates endpoint identity and authenticated communication. No CDP token, port or raw command channel is exposed to the frontend. Requests and frames are bounded; uncertain action results are not retried automatically. Exit/stop must terminate the managed process.

The app uses `serve --workers 1`, so the unrelated scrape worker companion is not packaged. The exact actual API evidence belongs in docs/UPSTREAM_AUDIT.md.

## AI and approvals

AI chat is a Rust request to a fixed provider endpoint using an OS-keychain key. User-entered chat text is transmitted; page contents are not automatically attached. Responses are displayed as text, not executed as tools or instructions.

Automation input/navigation is mediated by a short-lived, one-use approval queue. Exact action data, page identity/generation and fresh visual state are checked. Denial, expiry, replay and page changes fail closed. No unsupported upload or arbitrary execution fallback is allowed.

## Distribution

NSIS Windows installers and macOS app/DMG bundles require target-platform tooling. The repository includes a manually triggered build workflow; its presence does not establish execution or successful artifacts. Signing, notarization and installed-app smoke tests are separate gates.
