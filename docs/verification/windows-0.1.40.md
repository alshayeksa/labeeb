# Windows 0.1.40

- Added Research Agent mode: web search or up to three explicitly selected tabs, bounded source selection, evidence synthesis and source links.
- Added visible task progress, stop, partial-failure reporting and provider disclosure.
- Preserved Chat and explicit current-page requests.
- TypeScript and frontend suite: 157 passed across the full suite and two additional panel tests, 1 skipped. Production frontend build passed.
- Native Windows x64 release build and NSIS packaging passed. Portable EXE/ZIP collected and hashed. MSIX schema validation, archive integrity and executable hash comparison passed; see windows-0.1.40-msix.json. MSIX remains unsigned and was not submitted to Store certification.
- Research tests use mocked commands/provider responses. Live model quality, real search layouts and native end-to-end research have not been verified in this release.
- Stop prevents future steps and ignores responses; an already sent provider request may finish.
