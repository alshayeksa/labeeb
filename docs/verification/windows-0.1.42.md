# Windows 0.1.42

Fixed native page geometry after changing interface language while the assistant is open. CSS mirrors the panel, but a position-only change does not fire ResizeObserver. The bounds effect now depends on locale, so the native WebView moves to the current content rectangle without requiring an AI-button toggle or remounting the assistant.

Regression test reproduced the failure before the fix, then passed for Arabic -> English -> Arabic with unchanged width, visible native page bounds and the same open assistant panel. App and AssistantPanel suites: 41 tests passed. TypeScript and production frontend build passed. Native UI interaction not manually verified.
