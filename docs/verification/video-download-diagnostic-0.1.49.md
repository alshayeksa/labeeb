# Video download diagnostic build (0.1.49)

The second computer fails in both the Store package and the direct installer.
Its supplied report verifies all three pinned tools and successfully downloads
and merges a small sample outside Labeeb. This does not establish an MSIX-only
problem. A local full download of OL7V7CUwWDM using the application's exact
720p arguments also succeeded. The root cause on the second computer is unknown.

This diagnostic build retains downloader errors instead of overwriting them
with trailing warnings, drains final stderr after process exit with a two-second
deadline, and displays the bounded error text and exit status in the download
failure message. It does not change download arguments, tools, or directories.
Diagnostic text stays in the existing local job state; no telemetry is added.

Validation: seven video unit tests passed (one network test ignored), including
error precedence and the 2,000-character bound. Frontend and Windows installer
build results are checked separately before delivery. This is a diagnostic
installer, not a confirmed fix or a Store release.

TypeScript/Vite and the Windows x64 release/NSIS build completed successfully.
Delivered separately as `artifacts/Labeeb-0.1.49-diagnostic-Windows-x64-setup.exe`;
the original installer and Store artifact in `artifacts/` remain unchanged.
