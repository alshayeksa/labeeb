# Labeeb 0.1.35 — AI Reader, Milestone A

## Implemented
- Existing left assistant gains Chat / Read Page, explicit selection of up to two existing tabs, per-request disclosure/consent, selection-only mode and localized errors.
- Read-only fixed DOM extractor: selected text, visible article text, headings, HTTP(S) links without query/fragment, HTML tables. Fresh extraction per request; no background history/page collection.
- Existing configured providers receive bounded untrusted page data for summarization, translation, explanation and comparison. No model-generated code or browser action tools.
- Local CSV/JSON exports through native Save dialog; CSV quoting, UTF-8 BOM and spreadsheet formula neutralization. Explicit CSV requests in Read Page route to local export. Export does not need AI credentials.
- Reader access restricted to trusted main shell; rejects invalid/internal/unknown targets, stale URLs, loading pages and navigation during collection. Five-second read timeout, 60-second provider timeout, bounded results.

## Validation
- `npm run check`: **140 passed, 1 skipped** (TypeScript + 22 frontend test files).
- Rust library suite: **42 passed, 4 ignored**. Added target validation tests; existing provider, credentials, browser, storage and download suites pass.
- Real **WebView2 integration probe PASS** using a temporary independent profile and synthetic localhost HTML: visible text and table returned; hidden text and input value excluded. No user keys, credentials or browsing profile used. Test executable required Common Controls v6 manifest; initial loader failure was resolved with link arguments. Icon/shutdown warnings from the minimal probe do not change its passing assertions.
- Production build: Tauri CLI, Windows x64, NSIS. Portable archive and Store MSIX packaging checks are recorded alongside artifacts.
- No AI provider call was made with the user's key. Actual model response quality and end-to-end Save dialog interaction remain manual acceptance checks. macOS compilation/runtime and visual screenshot review were not performed in this environment.
- No performance improvement claim. Test run duration is not a UI benchmark.

## Limits
Agent mode is unavailable in A. Actions/approvals/runtime belong to milestones B/C. Reader covers top-document DOM; excludes frames, canvas, closed shadow roots, form/editable contents, invisible elements and unloaded content. PDF viewers and virtualized sites may be unsupported/partial. Limits: two tabs, 24,000 extracted characters per page, 6,000 per text section, 12 tables, 100 rows/table, 30 cells/row, 80 headings, 100 links, 16,000 text node visits. Truncation is marked; merged cells are not expanded. CSV prefixes potentially executable cells with an apostrophe.

Redaction detects common token/password patterns, but cannot guarantee removal of all personal data rendered as normal text. The user must choose appropriate sources. Hostile page scripts can affect DOM results; treat output as untrusted evidence. No action capabilities are exposed, preventing page instructions from triggering browser side effects.

## Changed implementation files
`src/AssistantPanel.tsx`, `src/ReaderControls.tsx`, `src/pageReader.ts`, `src/App.tsx`, `src/styles.css`; `src-tauri/src/page_reader.rs`, `page-reader.js`, `desktop.rs`, `lib.rs`, `build.rs`, `capabilities/shell.json`; generated command permissions; frontend reader/assistant tests; native `examples/reader_probe.rs`; version metadata and architecture report.

## Manual acceptance
Open a normal HTML page, open left assistant > Read Page > Select current page. Check disclosure consent and submit the five-point summary request. Select text in the page and choose Selected text only for translation/explanation. Select two tabs for comparison. Use Save tables CSV / Save content JSON for local exports. A CSV command also routes to export. Re-select/consent after navigation; errors must preserve the typed question. Chat continues to send typed text only.

## Reproduce native probe
Use Cargo `rustc --example reader_probe --target x86_64-pc-windows-msvc` with linker arguments `/MANIFEST:EMBED` and `/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'`, then run the debug example. Probe exits 0 on success, 1 on failed assertions, 2 on watchdog timeout.
