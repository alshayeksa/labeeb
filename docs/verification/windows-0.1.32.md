# Labeeb 0.1.32 — duplicate save prompts and DeepSeek

Save proposals now compare the exact HTTPS origin, trimmed username, and submitted password with the vault on a blocking worker. Identical credentials suppress the notice without unlocking the vault or returning secrets to React. Changed passwords and new accounts still offer saving. Failed comparisons do not assert a match or overwrite a credential. Pending proposal identity and active-tab/saving state are rechecked before notification. Existing Windows verification on vault access remains unchanged.

AI previously used a fixed OpenAI endpoint/model. Settings now select OpenAI or DeepSeek when saving a key. The provider setting persists in the settings database; separate provider keys remain in the OS keychain. Legacy installations default to the existing OpenAI key account. Provider changes clear the input; the currently active provider is shown separately until a new key is saved. Requests use fixed endpoints, reject unknown providers, and disable redirects. No existing key is automatically sent to a different provider. Keys supplied earlier as OpenAI must be entered again under DeepSeek.

DeepSeek uses `https://api.deepseek.com/chat/completions`, `deepseek-flash`, and explicit disabled thinking for this short-answer assistant. Verified against https://api-docs.deepseek.com/ and https://api-docs.deepseek.com/guides/thinking_mode/ on 2026-11-14. HTTP 402 maps to the existing quota/billing message. OpenAI behavior is preserved.

Tests cover identical credentials, changed passwords/accounts/origins/ports, missing secrets, comparison without unlocking, fixed provider destinations/key accounts, provider selection and key input clearing, legacy OpenAI saving, and the billing error mapping.

Validation: `npm run check` passed (TypeScript; 132 frontend tests passed, 1 skipped). Rust library tests passed (38 passed, 4 ignored). Logs accompany this record.

Live authenticated DeepSeek requests and repeated native-site logins were not performed by the assistant. Release artifacts require user verification on the affected site. No Store upload or installed-MSIX test was performed.
