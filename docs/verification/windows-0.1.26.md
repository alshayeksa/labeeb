# Labeeb 0.1.26 — independent password vault

Settings now offers a manually populated password vault with bilingual labels, site/account metadata, masked passwords, explicit reveal/hide and confirmed deletion. It does not import WebView2 passwords, capture website login forms or autofill websites. The existing WebView2 save-password preference remains independent. Clearing browsing data does not clear this vault.

Secrets use Windows Credential Manager through keyring. SQLite holds only generated record IDs, HTTPS origins and usernames. Passwords are not included in snapshots, listing responses, logs or localStorage. Rust secret buffers use Zeroizing where owned by the vault; IPC/JavaScript copies necessarily exist during manual entry and authorized display. Windows account protection is the storage boundary; this does not protect against malicious software already running as the same Windows user.

Reveal and deletion require a backend-created proof of successful Windows UserConsentVerifier authentication, using the desktop HWND interop API. Cancellation and unavailable authentication fail closed. The interface requires Windows 11 and configured Windows Hello/PIN; addition is disabled when verification is unavailable. Verification prompts are single-flight. Displayed passwords disappear after 20 seconds, on blur/visibility changes and when closing the panel. Late reveal results are discarded after unmount or while the document is unfocused. Remote website webviews have no vault capability, and every command checks the trusted local shell caller.

Validation completed before the release build:
- TypeScript and frontend suite: 93 passed, 1 skipped. Seven vault tests cover deferred reveal, timeout, blur/unmount, cancellation, deletion confirmation, manual addition, unavailable authentication and background windows.
- Rust core suite without desktop features: 22 passed, 1 ignored. Vault tests cover metadata persistence without plaintext secrets, input validation, duplicates, foreign IDs, storage failure handling and verification single-flight.
- Windows desktop cargo check passed, including the Windows authentication interop API.
- Windows desktop vault tests: all 5 passed, including an actual Windows Credential Manager write/read/delete with a synthetic secret.

The native credential-store test uses only a generated UUID and a synthetic secret, cleans it up, and never accesses existing user credentials. Its result is recorded separately in windows-0.1.26-vault-tests.log.

Limitations: Windows Hello interactive success/cancellation has not been exercised by the agent. Microsoft Store installation/update behavior has not been tested, and no Store submission was made. Packaged and portable app data can be separate; this is not a sync/export facility. Build and package results are recorded in the associated build log and MSIX verification JSON.
