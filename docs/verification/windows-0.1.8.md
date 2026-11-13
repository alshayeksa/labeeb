# Labeeb 0.1.8 — light and dark appearance

Added a sun/moon toolbar button and Settings > Appearance with Light, Dark and System choices. The preference is saved locally and applied before React renders. System mode follows live OS preference changes; explicit choices remain stable. Blocked storage falls back to a session-only choice. This changes the trusted browser interface; third-party pages retain their own appearance.

Light colors cover navigation, tabs, address suggestions, sidebar, home, settings, About, diagnostics, assistant, dialogs and status messages. The previous dark palette is retained as the fallback. Native HTML controls use the resolved color scheme.

Validation: TypeScript and all 41 frontend tests passed. Checks include toolbar/settings synchronization, remount persistence, OS appearance changes, listener cleanup and storage denial. Windows release and NSIS results: windows-0.1.8-build.log. Backend behavior is unchanged; the 16 Rust tests last passed in 0.1.7. Installer is unsigned; install/uninstall and macOS are not verified.

Native UI check: launched the packaged 0.1.8 executable, switched the home screen to Light using the toolbar, verified the Light selection in Settings, and selected System to return to the current dark OS appearance. Screenshots confirmed both palettes. Left the application open on Settings with System selected.
