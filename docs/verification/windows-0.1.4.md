# Labeeb 0.1.4 — browser usability

Implements Windows native page zoom and keyboard routing between WebView2 tabs and the trusted shell. Page content receives no new IPC permissions. Only the local main shell may listen for native key events and invoke zoom/reopen commands.

Changes:
- Enable WebView2 native zoom hotkeys and Ctrl+wheel; show actual per-tab zoom and provide decrease/reset/increase controls.
- Ctrl+Enter completes a bare website name with `https://www.` and `.com`. Existing URLs and multiword searches are left intact.
- Ctrl+L, Alt+D, F6 select the address; Ctrl+T creates a tab and focuses the address.
- Ctrl+W closes, Ctrl+Shift+T reopens the last closed URL (up to 20, current session only; form state is not restored).
- Ctrl+Tab/Shift+Tab and Ctrl+1..9 switch tabs. Middle-click closes a tab.
- Ctrl+R/F5 reload; Alt+Left/Right navigate; Ctrl+D bookmarks; Ctrl+H/J open history/downloads.
- Escape in the address restores the current URL. A keyboard shortcuts dialog is available in the toolbar.

Reference conventions: [Chrome](https://support.google.com/chrome/answer/157179?hl=en), [Edge](https://support.microsoft.com/en-us/edge/keyboard-shortcuts-in-microsoft-edge), and [WebView2 controller events](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2controller).

Validation passed: `ux-frontend.log` (30 tests), `ux-check.log` (native type check), `ux-rust-tests.log` (14 tests, including real sidecar lifecycle), `windows-0.1.4-build.log` (native release and NSIS package).

The portable executable launched as PID 43668. UI accessibility exposed Arabic zoom controls, 100% reset, shortcut help and the ready state. The screenshot was black and the input helper returned `failed to activate captured window`; fresh window selection and one activation retry failed identically. No native keyboard interaction is claimed as manually verified. The new application was left open for user testing. Package integrity is recorded in `windows-0.1.4-artifacts.json`.

Limits: Windows is the verified target. Native key routing is Windows-specific; macOS was not tested. Zoom is per open tab, not a persisted per-site preference. Reopening restores the URL, not the prior back/forward or form state. Installer signing and install/uninstall certification are outside this trial.
