# Labeeb 0.1.5 — sidebar and address suggestions

Changes:
- 48px icon sidebar by default; explicit expanded view (208px) and hidden mode. The toolbar always offers a show/hide button. The mode is saved in local storage; no browsing data is duplicated there.
- Primary navigation: browser, bookmarks, history, downloads. More exposes automation, approvals and About. Settings and language remain in the footer; pending approvals have a count badge.
- Address suggestions use the existing local history and bookmark snapshots. Match by URL or title, prioritize hostname prefixes, deduplicate URLs, and cap the list at six. No request is sent to a search suggestion provider.
- Accessible combobox/listbox; Arrow keys select, Enter navigates, Escape dismisses without losing the draft, pointer selection works, and Ctrl+Enter still completes a bare domain name.
- While suggestions are open, native child bounds reserve room for the list, keeping suggestions clickable and the remaining website visible.

Validation: TypeScript and all 36 frontend tests passed (`sidebar-address-check.log`). Tests cover ranking, Arabic titles, deduplication, invalid URL rejection, sidebar persistence and visibility, keyboard suggestion selection, Escape, and existing features. Native build log: `windows-0.1.5-build.log`.

Backend behavior is unchanged from 0.1.4; its 14 Rust test results remain historical and were not rerun for this UI change. Suggestions cover the snapshots already loaded (up to 500 recent history rows and 2000 bookmarks). Windows installer remains an unsigned trial; macOS and install/uninstall are not verified.

Runtime: the portable 0.1.5 executable launched (PID 35584). Its accessibility tree confirmed the compact sidebar, expand/hide controls, More, settings, and address combobox with the native ready state. Manual interaction could not be completed: another WebView2 window occluded the target and the input tool rejected the click as outside the target. The screenshot showed the older overlapping window, so it is not claimed as a visual verification of 0.1.5. Keyboard and persistence behavior are covered by the automated component tests. The previous window was kept open to preserve the user's current session.
