# Windows 0.1.43

Added Agent > Actions: selected-tab click/fill/select, exact per-step approvals, one-use native tickets, stale page checks, cancellation, bounded steps, duplicate-action prevention and re-observation after actions. Research and existing Chat remain available.

Validation:
- TypeScript and production frontend build passed.
- 167 frontend tests passed, 1 skipped. Initial suite under concurrent Rust compilation exceeded one existing 5-second test timeout; rerun with a 15-second timeout passed.
- Native cargo check passed.
- DOM tests cover privacy, fill events, stale descriptors, document nonce and select values.
- Workflow tests cover approval, rejection, cancellation and strict action parsing.
- Native synthetic WebView2 probe passed: fill and input event, click with observed result, rejected click unchanged, consumed ticket cannot be reused. The standalone probe requires its Common Controls v6 manifest; its first run without that manifest failed at Windows loader startup, and the manifest-equipped rerun passed.
- Live AI-provider planning is not covered by the synthetic probe.

Limits: live provider planning quality and arbitrary public websites are not verified. Every mutation requires user approval. No password/payment-field/file/CAPTCHA automation; no iframe or shadow DOM support. Stop does not undo dispatched actions.
- Windows x64 native release build passed. Standalone executable and NSIS bundle generated. Store packaging validation is recorded in windows-0.1.43-msix.json.
