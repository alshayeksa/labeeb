# Labeeb AI Reader — Milestone A

## Audit (2026-11-14, before implementation)

React 19/TypeScript shell, Tauri 2.12.5 (unstable child webviews), Rust backend. `App.tsx` owns tab/sidebar layout; `AssistantPanel.tsx` is the existing left AI panel. `desktop.rs` owns native tab WebViews, navigation, trusted IPC and AI requests. `ai_provider.rs` supports OpenAI, DeepSeek, Claude and custom endpoints. Keys stay in OS credential storage. `store.rs` persists browser metadata. Obscura and the native rendering architecture are unchanged.

Only local `main` has shell capabilities; remote pages have none. Every new reader command must also call `trusted`. Existing password adapters use fixed scripts and native callbacks. Tauri's installed `Webview::eval_with_callback` provides a result channel without giving page JavaScript shell capabilities. Use that fixed-script adapter; never accept script strings from the model or UI. Both WebView2 and WKWebView are intended targets; only Windows can be built/tested here. macOS runtime behavior remains unverified.

## Problems and decisions

The current assistant receives only typed text: there is no page context, explicit tab selection, structured extraction or export. Extend the same sidebar with Chat and Read Page. Agent remains visibly unavailable until later milestones. Each request explicitly names up to two tab IDs and their expected URLs; reject unknown, internal, unloaded or changed pages. Consent is per request, not blanket access to browsing history. Read current DOM on demand, never poll entire pages.

Extract top-document visible text, selected text, headings, links and tables with bounded traversal/output. Skip all form controls, editable content, hidden nodes, scripts and embedded frames. Strip query/fragment from exported links; redact recognizable secrets. Arbitrary secrets rendered as ordinary text cannot be perfectly identified: show disclosure and require user consent before sending. Selection must also pass the safe-node filter. Virtualized/offscreen/unloaded documents, canvas, PDF viewer and closed shadow roots cannot be read reliably; report empty/partial content. Never enter cross-origin frames.

Provider requests retain redirect prohibition, timeout and response limits. Context is explicitly untrusted data, not system instructions. No model tools exist in A, so page prompt injection cannot execute browser operations. It can still affect answer quality; users must assess results. CSV export is deterministic, quotes cells and neutralizes spreadsheet formulas. Context stays in memory; no page contents, prompts or keys enter audit logs.

## Upstream review

https://github.com/CopilotKit/OpenBot (reviewed 2026-11-14) advertises MIT licensing, AG-UI and a Docker-based backend. Reuse architectural separation only; import no code or dependencies. Any future copied component requires its own license review/notice. No Docker, Postgres, Chromium bundle or Electron is added.

## Later milestones

B: typed actions and backend policy/parameter-bound approvals. C: bounded runtime, cancellation, steps and metadata-only retention controls. These are not represented as working features in A. No autonomous actions or external side effects are introduced by the reader.

## Research agent — 0.1.40 (2026-11-15)

The Agent mode now runs a bounded read-only research workflow in the trusted shell. Users can select up to three open tabs, or request a web search using the configured search engine. Search opens a new tab, extracts observed links, asks the configured model to select source indexes, then opens and reads at most three sources. Model text cannot supply commands, scripts, or new URLs. Search navigation filters credentials, local literal hosts, query strings and common action paths; this is a conservative navigation filter, not a network sandbox. Sites still run under the browser's ordinary navigation and session behavior.

The UI discloses that the task and page content go to the connected provider. Only explicitly selected tabs or sources discovered by this task are read. Provider calls use the existing bounded ai_ask command, OS key storage, timeout and response limits. Final evidence is byte-bounded, query/fragment stripped from source URLs, and supplied as untrusted data. Answers carry numbered references alongside a deterministic list of pages actually read. Partial failure is reported; no answer is synthesized when all reads fail.

Progress and Stop are available. Stop prevents subsequent workflow steps and ignores an in-flight result; it does not revoke an already sent provider request or browser navigation. Closing the panel/unmounting cancels the workflow. Existing chat remains separate. There are no form entry, purchase, send, delete, file or arbitrary-script tools in this milestone. Search result layouts, bot challenges, redirects with query strings, PDFs and unreadable pages can prevent research; users can select already loaded tabs instead.

Verification: mocked workflow tests cover selected-tab scope, live-search sequence, cancellation, partial/total failures, URL policy and UTF-8 request bounds. Live provider quality and native research navigation still require manual verification.

## Browser actions — 0.1.43 (2026-11-15)

Agent now has Research and Actions workflows. Actions operates only in an explicitly selected existing tab. A bounded eight-step loop observes top-document controls and visible reader text, requests one typed action from the connected provider, and asks the user to approve the exact proposed operation. Every click/fill/select requires approval, including submissions, purchases and deletions; the model cannot waive approval. Arbitrary scripts, coordinates, model-created URLs and arbitrary selectors are not accepted.

Native commands are restricted to the local main WebView and call `trusted`. Native observation produces control descriptors. Preparation consumes the observation and issues a UUID ticket binding tab, exact URL, document nonce, control descriptor, operation and value for 120 seconds. Execution consumes the ticket before invoking a fixed script, and rechecks URL, document and control identity. Rejecting consumes the ticket without executing. Unknown or timed-out outcomes are not retried; one stale pre-execution observation can be refreshed with a new approval. Identical dispatched actions are blocked from repetition in the same task.

The adapter supports ordinary text/search/email/tel/url/number inputs, textareas, native selects, buttons and HTTP(S) links. Password/file/hidden controls and recognizable payment, credential and CAPTCHA controls are excluded. No field values are included in observations. Generic custom controls, frames, shadow DOM and sites requiring trusted hardware events may be unsupported. This is not a semantic guarantee about a website: the approval screen explicitly asks the user to inspect the actual page and form before approving. Page-provided text remains untrusted and may affect model planning, but cannot execute outside the typed approval workflow.

After every dispatched step, the loop re-observes the page and supplies the outcome and current evidence to the planner. Fill/select reports whether the value stuck; click reports dispatch, not business completion. Final model summaries and uncertain outcomes require user review. Stop blocks further steps and approvals but cannot undo an action already dispatched. No prompts or action values are persisted to disk by this feature.

## Saved execution consent — 0.1.44 (2026-11-15)

Supersedes the per-step UI approval flow from 0.1.43 at the user's request. Model settings now contain an explicit, unchecked-by-default agent execution consent checkbox. Saving the API configuration persists this choice; an existing configured model can save/revoke the permission without re-entering the key. Changing provider/model/endpoint/protocol/workspace resets the draft checkbox. Deleting the key revokes execution permission.

The native snapshot exposes `agentEnabled`. The trusted native observe/prepare/execute commands all require both a configured model and saved consent. The execution command no longer accepts a frontend `approved` boolean. Revoking permission blocks future native commands; the UI also aborts running work when it observes revocation. The fixed action adapter, one-use parameter-bound tickets, expiry, page/element checks, duplicate prevention, step bounds and Stop remain. There is no per-step confirmation dialog once the user has granted permission in Settings. This permits the supported actions needed for explicit tasks, including clicks that submit forms. Existing credential/payment-field/file/CAPTCHA restrictions are retained.

Removed the native browser engine card (WebView2/WKWebView) from the home screen, and expanded the remaining privacy card across the available row.
# Status — 0.1.46

The experimental agent has been removed. Research and action panels, action scripts, native agent commands and their permissions are no longer included. The assistant is now conversation-only, with locally saved conversations, real streamed responses, cancellation, retry and copy controls. Explicit current-page reading remains available inside chat. The sections below are historical design notes, not the current product behavior.
