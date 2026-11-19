# Labeeb 0.1.27

Internal pages now scroll from the whole main viewport, including the empty margins beside centered content. Settings, history, bookmarks, downloads and About retain their existing content widths. Each section gets a fresh scroll container on navigation. The browser viewport and assistant retain their own scrolling.

Includes the independent manual password vault from 0.1.26. Its limitations and storage/authentication checks are documented in windows-0.1.26.md.

Validation: TypeScript and frontend suite passed: 93 tests passed, 1 skipped. Release build output is recorded in windows-0.1.27-build.log. Packaging scripts validate archive integrity, Store identity and manifest schema, and compare the MSIX executable hash with the portable executable.

Limitations: interactive scroll verification was not completed because computer-use tooling could not verify the browser URL. No Windows Hello interaction or Microsoft Store installation/update test was performed for this release. The Store MSIX is unsigned for Partner Center submission; nothing was uploaded or published.
