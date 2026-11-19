# Labeeb 0.1.33 — automatic filling independent of vault viewing

Removed the recurring saved-login confirmation banner and its unused UI/event path. Native form discovery now attempts filling the single account matching the exact HTTPS origin even in a fresh process with a locked vault. Multiple accounts remain selectable through the toolbar key, without Windows verification; no arbitrary account is chosen automatically. Unsupported forms or existing user-entered credentials are left untouched without a recurring notice. Forms are never submitted automatically.

The internal secret_for_site method checks credential ID and exact HTTPS origin before keychain access. It does not unlock the vault, create verification proof, or return the password through an IPC response. Native filling still rechecks the active tab, exact current URL before reading and immediately before script execution, top-frame HTTPS, same-origin form action, supported visible inputs, and automatic non-overwrite behavior. Vault listing/revealing/deleting remain protected by the session verification proof; opening the vault triggers Windows verification once per app session.

Added a regression test covering filling after reopening the vault database while the vault stays locked, rejecting different hosts, ports, HTTP, lookalike hosts and missing IDs. UI tests check that choosing an account does not call vault_unlock and that no saved-login notification listener is installed. Existing vault verification and page-safety tests remain in the suite.

No interactive wareef.app login or installed-MSIX test was performed by the assistant. No Store submission was made. Build/test/package logs accompany this record.

Validation: TypeScript and frontend tests passed (131 passed, 1 skipped); Rust library tests passed (39 passed, 4 ignored).
