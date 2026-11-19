# Labeeb 0.1.31 — discover saved logins on return visits

Previously the vault persisted the entry but filling was only accessible through the toolbar key. The user's wareef.app record was confirmed present by a read-only COUNT query, without reading account names or secrets.

The injected discovery script detects a top-level HTTPS login form on document load, dynamically inserted forms, focus, visibility restore and the native configuration handshake. Mutation scans are coalesced at 200 ms and messages are deduplicated per form element/URL. Discovery sends only a fixed message kind, with no DOM field values. Native processing validates the actual message source against the current WebView URL, active visible tab, and exact HTTPS origin; it is rate limited to one discovery per second per WebView.

If the vault is already unlocked for this process and exactly one account matches, native code fills the compatible form. The filling script rechecks the exact URL, HTTPS, top frame, unambiguous visible writable inputs and same-origin form action. Automatic filling refuses to overwrite an existing password or a different username, and never submits a form. Secrets are not sent to React.

If the vault is locked, several accounts match, or automatic filling cannot complete, a compact in-app saved-login notice appears. Discovery itself never requests Windows verification. Clicking Fill unlocks once per session, rechecks the current document, and fills the single matching account; multiple accounts use the chooser. Navigation/tab changes dismiss stale notices. Verification cancellation does not read or fill a password. Existing manual toolbar filling remains available.

Validation: TypeScript/frontend 130 passed, 1 skipped; Rust 36 passed, 4 ignored. Added tests for discovery without reading field values, dynamic form insertion, unsafe/ambiguous contexts, duplicate suppression, preserving user-entered credentials, explicit unlock-before-fill, cancellation and stale notices. Native automatic filling on wareef.app has not been interactively exercised in this release; user previously confirmed real-site saving with the transport correction.

Release build and package validation records are separate. No Store submission or installed-MSIX test was performed.
