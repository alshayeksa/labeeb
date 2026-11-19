# Labeeb 0.1.24 — assistant configuration and errors

The assistant textarea and Send button are disabled when no API key is configured. The Settings action remains available, and an existing draft survives disconnection. Configuring a key enables and focuses the textarea. A stored key is not a guarantee that the provider will accept it or that the service is reachable.

Raw AI errors are replaced with Arabic/English messages for missing configuration, transport failure, timeout, HTTP 401/403/429, and provider 5xx errors. Unknown errors use a generic localized message. Failed prompts remain available for retry. The Rust request path now distinguishes timeouts from other transport errors; TLS verification, provider, model and credentials handling are unchanged.

Validation: TypeScript and frontend tests passed: 86 passed, 1 skipped. Tests cover disabled input/send, no typing or request while unconfigured, configuration transitions, preserved drafts, Arabic transport errors, and error classification. Native compilation/package results are in windows-0.1.24-build.log and windows-0.1.24-msix.json.

No authenticated provider request was made. The original intermittent transport failure's underlying cause is not established by these changes. Native runtime and installed-MSIX tests were not performed for this version. No Store submission was made.
