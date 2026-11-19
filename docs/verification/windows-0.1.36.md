# Labeeb 0.1.36 — OpenAI Luna compatibility

## Confirmed cause and fix
Live synthetic requests using the user-designated `.github/.env` credential confirmed:
- Legacy request: HTTP 400, `unsupported_parameter`, `max_tokens`.
- Updated request: HTTP 200, nonempty visible answer.
- Transient connection resets also occurred during diagnosis; these were not treated as model rejection. A separate Rust diagnostic using the OS-saved credential encountered a network failure, so equivalence of that saved credential to the file credential was not established.

OpenAI requests now use `max_completion_tokens: 4096`. GPT-6 Luna uses `reasoning_effort: none` for this browser reader/chat workload. Other providers keep their own existing request schema; stored model choices/defaults are not changed. No dotenv loading or secret embedding was added. The shipping application still uses the key saved in Settings/OS credential storage.

HTTP 400/422, 404 and empty/token-limited answers receive specific Arabic/English explanations. Provider response bodies and secrets are never displayed or logged.

## Validation
- Frontend TypeScript and tests: 145 passed, 1 skipped.
- Rust library tests: 43 passed, 4 ignored.
- Synthetic live API test: successful response with GPT-6 Luna and updated parameters. No page content, personal messages or vault contents were sent. Only allowlisted error codes/parameter names and status/answer-presence flags were reported.
- Windows x64 production build uses Tauri CLI; MSIX is unsigned for Partner Center, not submitted/installed by this task.

## Files
`src-tauri/src/ai_provider.rs`, `src/assistantError.ts`, `src/i18n.ts`, associated tests, version metadata, diagnostic-only `scripts/probe-openai.py` and `src-tauri/examples/ai_connection_probe.rs`.

## References
https://developers.openai.com/api/docs/models/gpt-6-luna
https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
