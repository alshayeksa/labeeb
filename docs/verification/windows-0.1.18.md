# Labeeb 0.1.18

Adds an opt-in Windows setting, “Offer to save passwords”, using WebView2 ICoreWebView2Settings4. The native engine owns password prompts and storage; passwords are never returned through IPC or supplied to the assistant. The preference defaults off, is persisted in SQLite, and is applied before navigation for ordinary tabs. Viora retains its separate profile with password saving disabled.

Disabling the option stops new save/update prompts, but does not remove or stop filling previously saved passwords. The existing clear-all-browsing-data operation also deletes saved passwords on Windows; its confirmation description now states this.

Validation: TypeScript and 72 frontend tests passed (one performance test skipped). Tests exercise the native preference command, on/off rendering and unsupported-platform behavior. Native Windows cargo check passed. No interactive native login/save/update/autofill/restart/deletion test was performed; these remain manual verification gates. macOS is not offered this setting.

Native Windows release compilation and NSIS bundling completed (windows-0.1.18-build.log). The PowerShell redirection wrapper returned 1 after handling native stderr, although Tauri reported Finished 1 bundle. The installer exists and scripts/package.py succeeded, verifying portable archive integrity and recording SHA256 hashes in windows-0.1.18-artifacts.json. No installed-app pass is inferred.

Manual check: Settings > Website passwords > Offer to save passwords. Enable it, log into a test account and accept the native save prompt. Verify fill after restart, update prompt after a password change, no new save prompts when disabled, and deletion through browsing-data clearing. Use a test account, not a production credential.
