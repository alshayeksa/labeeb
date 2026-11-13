# Security

This is an implementation security model, not independent certification. Consult the exact final test record before sensitive use.

## Trust boundaries

The packaged local shell is privileged; remote native webviews and Obscura page content are untrusted. Only the main shell receives narrow Tauri capabilities, with backend caller checks as defense in depth. Page content is rendered as text in trusted UI, not executable HTML or instructions.

AI API keys are stored in the OS keychain. The shell holds newly entered text only transiently; it must clear it after save and must never persist it in localStorage, SQLite or logs. Keychain failure must not fall back to plaintext. The backend retrieves the key for the fixed TLS AI endpoint and must not return it in snapshots or errors. Explicit chat text goes to the external provider; private page data is not silently added.

## CDP and supply chain

Use only the bundled binary with an embedded SHA256 pin, a fresh per-launch bearer token, loopback ephemeral listener, and validated readiness identity. No raw CDP or arbitrary eval interface reaches frontend/pages/model. Tokenless/wrong-token requests and foreign origins must fail. Timeouts and size limits must be applied before unbounded buffering. The sidecar receives no AI key.

The Windows v0.2.6 sidecar can reset unauthorized HTTP connections rather than returning 401. Startup accepts either denial behavior for anonymous and wrong-token probes, but requires a successful request with the actual launch token. Probe timeouts and connection-establishment failures still abort startup.

Local same-user malware with process-memory/environment access is outside this protection. Loopback alone is not authentication. Do not enable private-network fetching in production to satisfy local fixtures.

The packaging script pins v0.2.6 archive digests and reads only the expected regular executable. It never extracts archive paths. The runtime pin is compiled into the host, not trusted from a writable colocated manifest. Signing may change bytes: finalize sidecar signing before hashing/compiling the host, then verify after bundling. Never bypass the integrity check to make a package work.

## Approvals

The model/page cannot approve itself. Rust approval records are exact-action, one-use and expiring. Context changes invalidate input approval. Forms, purchases, messages, uploads and destructive operations must not be dispatched by the app/AI without explicit approval. Unsupported uploads remain unavailable; generic execution is not a fallback.

Visual hashes do not establish semantic intent. A person must review the target and action, and dynamic pages remain a risk. Manual native browsing is not universally intercepted by this application's approval queue. Do not claim an enforced all-page transaction sandbox.

## Navigation/downloads

HTTP(S) and the explicit blank-page case are allowed; file/data/JavaScript and credential-bearing URLs are rejected. Validate actual URLs directly, not only address-bar search normalization. Popups, external protocols and OS permission prompts require platform tests.

Downloads must not auto-open, overwrite silently, escape the destination or remove unrelated existing files on failure. Cancellation must interrupt stalled network operations and remove only owned partial files. The host downloader's public-HTTPS/no-redirect/no-cookie limitations are intentional.

History clearing is not secure deletion and does not clear native cookies/cache.

## Required release checks

- Remote pages/subframes cannot invoke any privileged command.
- No key or CDP token appears in snapshots, logs, frontend persistence or pages.
- Wrong/absent CDP tokens, foreign Origin and nonloopback readiness fail.
- Approval deny/expiry/replay/races fail closed and uncertain actions are not retried.
- Tampered sidecar and wrong target pin fail.
- Stop/quit/crash cleanup leaves no unwanted child process.
- Downloads are path-safe, cancellable and never execute automatically.
- Exact dependencies and licenses are audited.
- Signed platform packages pass signature/notarization and installed-app smoke tests.

Unsigned candidate artifacts are not public production releases. Do not advise disabling SmartScreen, Gatekeeper or other OS security to run them.
