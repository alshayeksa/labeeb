# Compatibility

Daily browsing uses the platform webview. Current version: **0.1.17**.

| Target | Browser | Distribution status |
|---|---|---|
| Windows x64 | WebView2 | Native executable, portable ZIP and unsigned NSIS installer built |
| macOS Apple Silicon | WKWebView | Source/CI target; no verified delivered package |
| macOS Intel | WKWebView | Source/CI target; no verified delivered package |
| Linux | Development only | No end-user package claimed |

## Boundaries

- Windows requires WebView2. The installer can bootstrap it; the portable package requires it already installed.
- Native browser downloads and direct media downloads are separate paths. Windows browser downloads support session cookies, redirects and blob URLs; the direct media URL downloader restricts requests to public HTTPS without redirects or inherited cookies.
- Parallel downloading depends on server range support and eligibility checks. Incomplete downloads do not persistently resume after restarting the application.
- Media downloads depend on site support and the verified media tools. Protected streams and arbitrary playlists are not supported.
- Viora has a separate profile and bundled interface. Do not infer complete live-video compatibility.
- The AI assistant answers submitted text. Page contents are not attached automatically.
- No extension ecosystem, Chrome profile import, password manager, universal DRM or video-conferencing compatibility claim.
- SQLite/native browser data are not claimed encrypted at rest. Clearing history does not clear cookies or downloads.
- UI-only development cannot exercise native tabs, keychain or downloads.

See [release status](RELEASE_STATUS.md), [build instructions](BUILD.md) and [native test gates](TEST_PLAN.md). Platform targets and workflow definitions are not evidence of successful native execution.
