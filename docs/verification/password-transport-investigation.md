# Password message transport investigation

The installed 0.1.29 portable was running and its `vault-save` setting was true. On wareef.app, HTTPS navigation succeeded, but no object-shaped password readiness or diagnostic messages reached the native handler.

A temporary opt-in diagnostic build (`LABEEB_PASSWORD_TRACE=1`) recorded only fixed allowlisted status codes (maximum 200 per process; page trace maximum 30). It did not record usernames, passwords, page text, DOM field values or URLs. Native ExecuteScript confirmed `probe_script_present`, and a string-only probe produced `native_string_probe_received`. Thus the capture script was present and string transport worked while object messages did not reach the handler. The installed Wry 0.57.2 WebMessageReceived handler calls TryGetWebMessageAsString before the Labeeb handler.

Correction: page readiness, trace and password proposals now use JSON.stringify before postMessage. Rust decodes the outer WebMessageAsJson string into zeroizing storage before parsing the packet. Exact source checks, HTTPS restrictions, native save setting checks, explicit confirmation and identity verification are unchanged. No remote vault capabilities were added. Host-to-page configuration still uses PostWebMessageAsJson.

Validation: 116 frontend tests passed, 1 skipped; both targeted password_browser Rust tests passed, including escaped synthetic credential roundtrip, invalid/object envelopes and oversized messages. Real WebView2 readiness and user-controlled save flow remain pending at the time of this record.

The first diagnostic build used cargo directly and failed to include the production shell protocol. It was replaced with a successful Tauri CLI --no-bundle build. Diagnostic binaries are kept separately from the original 0.1.29 release artifacts and are not Store submissions.
