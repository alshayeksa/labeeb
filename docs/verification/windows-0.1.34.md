# Labeeb 0.1.34 — provider cards, Claude and custom connections

Includes the automatic password filling change described in windows-0.1.33.md: no recurring fill banner or Windows verification for filling; vault viewing stays session-verified. Version 0.1.33 was built but not packaged/delivered before the user added this request.

Replaced the native provider select with four themed radio cards: OpenAI, DeepSeek, Claude, Custom. Native radio controls retain keyboard navigation and accessible names, visible selection/check marks and focus outlines. Added editable model ID, custom full endpoint and protocol (OpenAI Chat Completions or Anthropic Messages), and optional Anthropic workspace ID. Keys clear on provider or custom endpoint changes. Saving activates the complete connection record. Configuration is persisted as one JSON setting, while keys stay in the OS keychain. Old OpenAI/DeepSeek installations migrate by reading the previous provider setting and preserving their key accounts. Custom key accounts are bound to endpoint and protocol hashes to avoid reusing keys at a new destination.

Claude requests use the Messages endpoint, top-level system prompt, x-api-key and anthropic-version headers, and text-block response parsing. Thinking blocks are not shown. Current default model is claude-sonnet-5-5; model ID remains editable. Sources checked 2026-11-14: https://platform.claude.com/docs/en/api/overview , https://platform.claude.com/docs/en/api/messages/create , https://platform.claude.com/docs/en/models/overview .

Built-in endpoint URLs are fixed regardless of supplied input. Custom endpoint validation requires HTTPS except literal loopback/localhost HTTP, a request path, no embedded credentials/query/fragment, bounded lengths, and one of the supported protocols. Redirects remain disabled. No real user key was read, printed or sent during testing; authenticated Claude/custom requests have not been exercised.

Frontend TypeScript/tests passed: 133 passed, 1 skipped. Rust library tests passed: 41 passed, 4 ignored. Tests cover provider selection, Claude/custom form arguments, key input clearing, provider headers/body separation, endpoint validation, response parsing, legacy migration and configuration persistence. Snapshot reconciliation preserves equal connection objects.

Visual check in local Vite preview through Microsoft Edge: Arabic dark-theme provider cards, selected state and custom fields showed no overlap or native white dropdown. Preview tab was closed and the task's port-1421 Vite server stopped. No configuration or real key was submitted in the preview. The in-app browser automation host was unavailable; native Computer Use was used for preview instead.

Build/package logs accompany this record. No Store upload or installed-MSIX test was performed.
