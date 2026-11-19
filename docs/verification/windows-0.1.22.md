# Labeeb 0.1.22 — startup hang correction

Observed on 2026-11-14: the installed Store 0.1.21.0 process was not responding, with CPU time unchanged at 0.15625 seconds across observations. Its latest diagnostic session contained only session_started. The application data was backed up locally before restarting; no profile reset was performed.

`app_snapshot` held the browser-data mutex while calling `Window::is_fullscreen`. In the installed Tauri runtime, that getter sends a UI-thread message and blocks on a channel. Meanwhile the synchronous `browser_bounds` command and native WebView callbacks acquire the same mutex on the UI thread. This permits a circular wait. The fullscreen query now runs before acquiring browser data. Architecture, engine and profile locations are unchanged.

Validation:
- TypeScript and frontend suite: 74 passed, 1 skipped.
- Rust core suite: 18 passed, 1 ignored network benchmark.
- Native Windows x64 release build and NSIS packaging passed.
- Portable 0.1.22 launched using the existing profile, loaded an HTTPS page, entered/exited F11 fullscreen, revealed the address bar with Ctrl+L, and closed normally. Windows reported Responding=True.

These observations establish a working local fix, not exhaustive coverage of every feature or proof of Microsoft Store certification. The newly built MSIX still requires installation/update testing in the packaged context and Store review. No Store submission was performed.
