# Windows 0.1.44

- Removed the native engine detail card from the home screen.
- Replaced per-step agent approval with explicit saved consent in model settings.
- Consent is off by default, can be saved with the key or separately for an existing configuration, and can be revoked. Removing the key revokes permission.
- Native observation, preparation and execution enforce saved consent plus configured-model status. Per-step frontend approval flags are no longer accepted.
- Stop, typed actions, single-use tickets, stale-page checks and sensitive-field exclusions remain.

Validation: frontend suite passed 170 tests (1 skipped), plus a new settings save/revoke integration test. After the final changes, all 39 targeted frontend tests passed; TypeScript and the frontend production build passed. The native saved-consent test passed (1 test). No new live model/provider test; the DOM action adapter is unchanged from the native fixture verified in 0.1.43.
