# Architecture

## Surfaces and trust

The trusted local Tauri shell renders React controls, Arabic RTL/English LTR, history/bookmarks, downloads, settings and chat. Fonts are bundled locally. Remote pages run in separate native child webviews, with no matching IPC capability. Rust manages tab identity, lifecycle, bounds and visibility so native content does not obscure trusted controls.

Windows uses WebView2 and macOS uses WKWebView for daily browsing.

## Backend ownership

Rust owns SQLite, OS-keychain credentials, download destinations, AI network calls and media-tool process startup. The frontend has named commands, not arbitrary shell execution, JavaScript evaluation, executable paths. Remote content cannot invoke privileged browser commands.

SQLite stores history, bookmarks and nonsecret settings with parameterized queries, schema versioning and retention limits. It is not encrypted. Native webview storage is separate; clearing history does not erase cookies, caches, saved credentials or downloads.

Labeeb's password vault stores only IDs, HTTPS origins and usernames in a separate SQLite database, opened lazily. Secrets are held by Windows Credential Manager. A top-level HTTPS login-form script proposes credentials only when Labeeb saving is enabled; the native message handler validates the sender URL against WebView2's current document, checks the active visible tab, rate-limits proposals, and holds at most one pending secret for 120 seconds. Only metadata reaches the trusted shell's approval dialog. Saving/updating, filling, reveal and delete require native Windows UserConsentVerifier verification (manual additions remain explicit vault actions). Fill is requested by the user, matches the exact origin, rechecks the document URL before and after authentication and at script execution, and never submits forms. Remote pages have no vault IPC permissions. Native WebView2 password saving is always disabled; existing native passwords are neither imported nor silently deleted. See docs/verification/windows-0.1.28.md for scope and validation limitations.

## AI assistant

AI chat is a Rust request to a fixed provider endpoint using an OS-keychain key. User-entered chat text is transmitted; page contents are not automatically attached. Responses are displayed as text, not executed as tools or instructions.

History clearing retains its local confirmation dialog. Bookmark and API-key removal execute directly through trusted-shell commands.

## Distribution

NSIS Windows installers and macOS app/DMG bundles require target-platform tooling. The repository includes a build workflow triggered manually, on pushes to main and on pull requests; its presence does not establish execution or successful artifacts. Signing, notarization and installed-app smoke tests are separate gates.
