# Labeeb 0.1.30 — compact password saving and session vault unlock

User confirmed successful real-site saving on wareef.app after the string-message transport fix. That fix is included in this release.

Save offers now use a compact, nonmodal notification inside Labeeb with Save and Not now. They do not take keyboard focus or darken/hide the web page. Native child-WebView bounds reserve the bottom notification strip so the WebView cannot cover the React notification. This is an in-app notification, not an operating-system toast.

Saving/updating an offered password requires explicit approval but no Windows Hello prompt. Saving never unlocks the vault. Opening the vault (including account choices from the address bar) calls a trusted-shell-only vault_unlock command. Successful Windows verification unlocks an in-memory session flag. Cancelled/failed verification does not unlock it. Vault listing, manual addition, reveal, delete, account choices and filling enforce that session state in Rust; remote pages have no access to these commands. The flag is not persisted, and a new process starts locked. Closing/reopening the vault during the same process does not prompt again. Displayed passwords still hide on blur and after twenty seconds. Entry deletion still asks for confirmation.

Tests: 117 frontend tests passed, 1 skipped; 36 Rust tests passed, 4 ignored. Includes transport escaping/limits, metadata-only traces, notification approval without modal activation, cancelled unlock before any vault list request, saving while locked without unlocking, repeated session proofs and a fresh vault instance starting locked.

Real Windows Hello session reuse and the compact notification layout have not yet been exercised interactively. Prior user confirmation covers saving with the corrected transport, before this UX change. Release artifacts and MSIX schema/archive checks are recorded separately. No Store submission was performed.

Optional investigation tracing remains disabled unless LABEEB_PASSWORD_TRACE=1 is explicitly set before launch; it records fixed allowlisted status codes only, with a process cap. Release launches do not enable it.
