# Labeeb 0.1.20

Browser fullscreen now hides the title/tab bar, address toolbar, navigation sidebar, assistant and status bar. The native browser-area rectangle expands with the layout. The native window fullscreen state is returned in snapshots; the existing state reconciliation preserves it. F11 restores controls and the prior assistant/sidebar preferences. Ctrl+L reveals controls for navigation; Escape hides the revealed controls again. Navigating through the address bar or selecting a tab also hides them. Internal settings/library pages retain navigation controls.

Validation: TypeScript and 74 frontend tests passed (one benchmark skipped). The added regression test covers entering fullscreen, removing controls and assistant, Ctrl+L reveal, Escape hide and restoring the assistant on exit. Existing tests cover F11 repeat/modifier handling. Interactive native visual checks, multi-monitor/DPI checks and macOS checks have not been performed. Native page bounds use the existing resize observer, explicitly refreshed when immersive layout changes.

Native Windows release build and NSIS bundling passed (exit 0). Build log: windows-0.1.20-build.log. Packaging produces windows-0.1.20-artifacts.json.
