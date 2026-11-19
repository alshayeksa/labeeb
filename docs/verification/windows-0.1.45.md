# Windows 0.1.45

- Updated home privacy copy in Arabic and English.
- Added a dedicated native-engine section to About (Windows WebView2 / macOS WKWebView).
- Added local history and bookmark search across titles, URLs (including decoded paths), and dates. Supports multiple terms, Arabic diacritics/letter variants and Arabic digits.
- Removed snapshot query limits so search includes all retained entries; renders 50 results at a time with Show more.
- Added result counts, clear-search control, Escape reset and no-results states.

Validation: TypeScript and frontend production build passed. 36 frontend tests passed (App and search); 5 native store tests passed. No live installed-app UI test in this change.
