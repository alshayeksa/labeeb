# Labeeb 0.1.28 — Labeeb-owned website password saving

The password-saving switch now controls the Labeeb vault (`vault-save`). The old switch value is migrated once, but no passwords are read from or copied out of WebView2. All WebView2 password-autosave setter calls now pass false, for the shell and browsing tabs. Existing WebView2 passwords are neither deleted nor prevented from legacy filling by this setting; the UI explains that deleting a vault entry does not remove a legacy copy.

Supported top-level HTTPS forms offer to save a username and one password after form submission. The trusted Labeeb dialog names the real sender origin and account, and explicitly does not claim login succeeded. Explicit approval and Windows identity verification are required before saving/updating a captured login. Disabling saving rejects new proposals and clears the pending proposal. Manual vault addition and explicit filling remain available while save offers are off.

The address-bar key action lists vault accounts only for the active origin. After account selection and Windows verification, the backend fills a compatible form without submitting it. Both native and script checks enforce the exact document URL; the selected entry must match the HTTPS origin. The form action must also be same-origin. Credentials never pass through the React fill dialog or Tauri event payloads.

Protection boundaries:
- Remote pages have no privileged vault IPC capability. Native web messages are untrusted proposals, validated against WebView2 Source and the active visible tab, never authority to save or retrieve passwords.
- At most one pending captured secret is held in zeroizing Rust storage, with a 120-second lifetime and a ten-second offer rate limit. Metadata only is emitted to the shell. Secret strings are not logged or persisted to SQLite; Windows Credential Manager owns persistent secrets.
- Filling and captured-login updates require backend-created UserConsentVerifier proof. Verify is single-flight and fails closed. Filled DOM values are available to the intended website, as normal login inputs are; this cannot protect credentials from a malicious intended website or software running as the same Windows user. JavaScript/IPC/native API copies cannot all be deterministically wiped.
- Compatible forms must expose visible, unambiguous username and password inputs. Iframes, Shadow DOM, multi-step login forms, sign-up/password-reset forms and forms submitted without a supported submit event are not automatically supported. Manual vault entry remains available.

Validation:
- TypeScript/frontend suite: 107 passed, 1 skipped (windows-0.1.28-ui-tests.log).
- Windows desktop Rust suite: 34 passed, 4 ignored (windows-0.1.28-rust-tests.log), including synthetic Windows credential write/read/delete and same-account update behavior.
- Added form-script tests for disabled saving, untrusted events, HTTP/frames, cross-origin actions, ambiguous/hidden/new-password forms, document changes and filling without submission. Added prompt tests for explicit consent, dismissal, tab switching, verification cancellation and account selection.
- A fullscreen test exposed a late passive reset that could undo Ctrl+L; the reset now runs before paint. The complete suite passes after this correction.

Windows Hello interaction and a complete real-site login/save/fill/delete cycle have NOT been exercised. No Store install/update test or Store submission was performed. Release build and package verification are recorded separately. The MSIX is unsigned for Partner Center submission.

Design reference: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security (validate document source before web messaging and script execution).
