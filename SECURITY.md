# Security

This is an implementation security model, not independent certification. Consult the exact final test record before sensitive use.

## Trust boundaries

The packaged local shell is privileged; remote native webview content is untrusted. Only the main shell receives narrow Tauri capabilities, with backend caller checks as defense in depth. Page content is rendered as text in trusted UI, not executable HTML or instructions.

AI API keys are stored in the OS keychain. The shell holds newly entered text only transiently; it must clear it after save and must never persist it in localStorage, SQLite or logs. Keychain failure must not fall back to plaintext. The backend retrieves the key for the fixed TLS AI endpoint and must not return it in snapshots or errors. Explicit chat text goes to the external provider; private page data is not silently added.

## External tools

Media tools retain their integrity checks and are launched by dedicated backend commands.

## User actions

The AI assistant has no action tools. History clearing uses a local confirmation dialog; bookmark and key removal execute through trusted-shell commands. Remote webviews retain no privileged IPC access.

## Navigation/downloads

HTTP(S) and the explicit blank-page case are allowed; file/data/JavaScript and credential-bearing URLs are rejected. Validate actual URLs directly, not only address-bar search normalization. Popups, external protocols and OS permission prompts require platform tests.

Downloads must not auto-open, overwrite silently, escape the destination or remove unrelated existing files on failure. Cancellation must interrupt stalled network operations and remove only owned partial files. The direct media URL downloader is restricted to public HTTPS without redirects or inherited cookies. Native Windows browser downloads use a separate path supporting session cookies, redirects and blob URLs.

History clearing is not secure deletion and does not clear native cookies/cache.

## Required release checks

- Remote pages/subframes cannot invoke any privileged command.
- No AI key appears in snapshots, logs, frontend persistence or pages.
- Stop/quit/crash cleanup leaves no unwanted child process.
- Downloads are path-safe, cancellable and never execute automatically.
- Exact dependencies and licenses are audited.
- Signed platform packages pass signature/notarization and installed-app smoke tests.

Unsigned candidate artifacts are not public production releases. Do not advise disabling SmartScreen, Gatekeeper or other OS security to run them.
