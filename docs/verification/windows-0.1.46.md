# Windows 0.1.46 — conversation assistant

- Removed the experimental agent UI, model-setting execution consent, native action commands, permissions, and retired action/research sources.
- Added local saved conversations and drafts, new conversation, selection and deletion.
- Added actual SSE response streaming for OpenAI-compatible and Anthropic protocols, with a cancellable native request and per-request IPC channel.
- Preserves partial responses on stop/error; marks incomplete answers, supports retry and excludes incomplete turns from subsequent model context. Late responses cannot update another conversation.
- Added message/code copying, readable Markdown tables/code, inline errors and storage-failure notices. Current-page reading remains explicit within chat.
- Provider credentials remain in native credential storage. Chat history is local shell storage; page data is requested only for explicit current-page requests.

Verification: TypeScript and 163 frontend tests passed (1 skipped); 8 native provider/stream tests passed. Synthetic browser fixture streamed an Arabic answer, rendered a table, restored it after reload, and reported no browser errors or horizontal overflow. No real provider/key was used; an installed-app live-provider test has not been run.

Protocol references: [OpenAI streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).
