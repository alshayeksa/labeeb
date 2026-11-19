# Labeeb 0.1.23 — assistant interaction

Changes: Arabic/English assistant privacy copy refers to the AI model. An unconfigured assistant displays a persistent explanation and a button opening Settings. Unconfigured submissions preserve the draft and do not call the AI endpoint. Enter submits; Shift+Enter inserts a newline; IME composition does not submit. Existing Ctrl/Cmd+Enter support is retained. Includes the 0.1.22 startup-lock correction.

Validation: TypeScript and frontend suite passed (76 tests, 1 skipped). Assistant tests cover multiline entry, plain Enter submission, missing configuration, opening Settings, preserving drafts, configuration-state changes, IME composition, and failed request retries.

The API provider and credential configuration remain unchanged. No API request with a real key was made for this change. Native runtime interaction and installation of this version have not been tested. See windows-0.1.23-build.log and windows-0.1.23-msix.json for build/package results. No Store update was submitted.
