# Frontend / Rust IPC parity review

Reviewed 2026-11-13 against `src-tauri/src/desktop.rs`, `store.rs`, `policy.rs`, `automation.rs`, `capabilities/shell.json` and frontend sources. This is a source-level contract review, not a Windows/macOS integration-test claim.

All 20 invoked commands are registered in `generate_handler!` and have matching narrow shell permissions. Injected `Webview`, `AppHandle` and `State` arguments are supplied by Tauri, not the frontend.

| Command | Frontend arguments | Rust match |
| --- | --- | --- |
| app_snapshot | none | yes |
| tab_create | url: string | yes |
| tab_select | id: string | yes |
| tab_close | id: string | yes |
| tab_navigate | id, url: string | yes |
| tab_action | id, action: back / forward / reload / stop | yes |
| browser_bounds | x, y, width, height: number; visible: boolean | f64 / bool |
| bookmark_add | url, title: string | yes |
| bookmark_remove | id: number | i64; queues approval |
| history_clear | none | queues approval |
| download_cancel | id: string | yes |
| approval_resolve | id: string, approved: boolean | yes |
| settings_update | locale: ar / en | String validated by store |
| ai_key_save | key: string | 10–1024 bytes in Rust; input max length 1024 |
| ai_key_delete | none | queues approval; no success/deleted claim |
| ai_ask | prompt: string | 1–16000 UTF-8 bytes; returns `{text}` |
| automation_start | none | yes |
| automation_stop | none | yes |
| automation_navigate | url: string | yes; queues approval |
| automation_input | kind plus x/y, text, key, or deltaY | deltaY maps to Rust delta_y under Tauri default camelCase argument handling |

Snapshot field names are camelCase and match the frontend. Tab/approval/download IDs are strings; saved page IDs are SQLite integers. SQLite `visitedAt` is seconds and is converted to milliseconds for JavaScript dates. Nullable frame and download total byte counts are reflected in TypeScript. Automation status is running/stopped/faulted; input stays disabled unless the backend sets inputVerified.

Known approval summaries and kinds are localized. The fixed key-removal description is localized; user-specific payloads are displayed as inert text without HTML interpretation. AI request bodies contain only the explicitly entered prompt; the shell never sends page content automatically.

Adjustments made during review: key length UI aligned to the native limit, UTF-8 prompt and input-payload size guards added, nullable fields aligned, and key deletion routed to the approval panel. Runtime enforcement remains Rust-owned.

Evidence: `frontend.log` contains fresh check, test, production build and full dependency audit output including exit codes. Browser screenshot QA was not rerun after the documented socket permission failure.
