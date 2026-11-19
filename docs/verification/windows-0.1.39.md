# Labeeb 0.1.39 - Conversation context

- Removed the separate reader mode; explicit read/summarize-current-page requests attach only the active tab through the existing native reader. Ordinary chat does not attach pages.
- Sends the most recent complete chat turns (up to 16 turns / 128000 UTF-8 bytes) in provider message format, with server-side role and size validation.
- Clear conversation also clears context; failed requests are excluded from subsequent context.
- Improved response instructions without changing the configured model or provider parameters.
- Frontend: 149 passed, 1 skipped. Rust library: 46 passed, 4 ignored.
- Tests cover follow-up context, clearing, provider ordering, roles and limits. No live model quality comparison performed.
- MSIX installation and Store certification remain untested.
