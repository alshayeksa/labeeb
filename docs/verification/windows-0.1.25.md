# Labeeb 0.1.25

Renames the password-saving control to "Allow saving passwords" in Arabic and English. Displays explicit Enabled/Disabled text, a check mark and active styling when enabled, and a success notification after the native command succeeds. The preference still uses WebView2's existing password-saving mechanism; this release does not change credential storage.

Includes the earlier startup deadlock correction and assistant input/error improvements.

Validation: the preceding source verification passed TypeScript and 86 frontend tests (1 skipped), including the password toggle's native command, displayed state and success notification. Only release version metadata changed after that run. Build output is recorded in windows-0.1.25-build.log. Package identity, schema, archive integrity and executable hash checks are recorded in windows-0.1.25-msix.json.

This release has not been installed or exercised in the Microsoft Store packaged context. No real login/password save was performed, and no Store update was submitted. The MSIX is unsigned for submission to Partner Center.
