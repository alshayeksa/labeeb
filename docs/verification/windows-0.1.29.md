# Labeeb 0.1.29 — password capture reliability

The previous injected script sent one readiness message at document creation and listened only for `submit`. If the native document URL was not ready, its strict source check could reject that handshake and capture would remain disabled. Page code calling `form.submit()` or clearing the fields before the submit event was also missed.

Changes:
- Retry the settings handshake at DOMContentLoaded and pageshow. Deliver the current saving setting again from native NavigationCompleted. Capture still starts disabled; the native backend independently checks the persisted setting for every offer.
- Capture trusted submit-button clicks and unmodified Enter in login fields before page handlers run. Keep submit-event support. Deduplicate offers and never prevent the event or submit a form.
- Check submitter-specific formaction as well as the form action. Exclude disabled controls, invalid forms, non-submit buttons, untrusted events, composition keys and modified Enter.
- Retain exact native message source checks, HTTPS/top-frame restrictions, explicit trusted-shell approval, Windows identity verification, and Windows Credential Manager storage. No WebView2 credential migration or deletion.

Validation:
- TypeScript/frontend: 115 passed, 1 skipped. Eight additional regression cases cover readiness retries, early capture, duplicate suppression and rejected activations.
- Windows desktop Rust: 34 passed, 4 ignored, including the synthetic Credential Manager roundtrip and vault upsert tests (windows-0.1.29-rust-tests.log).
- Build/package records are written separately by the packaging scripts.

The public wareef.app landing page was retrieved; /login inspection was rejected (connection reset / HTTP 403). No credentials were submitted to that site. These changes have NOT been verified through a real wareef.app login, a native WebView2 save-dialog interaction or Windows Hello. This is a tested correction of identified capture gaps, not a confirmed resolution for every website.

Limitations remain: form-less/custom type=button logins, multi-step usernames, Shadow DOM, iframes, sign-up/reset and ambiguous forms are not automatically supported. The prompt offers the entered credentials and does not establish successful authentication. Manual vault addition remains available.
