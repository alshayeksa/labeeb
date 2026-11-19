# Labeeb 0.1.13 Windows candidate

Changes: removed Obscura automation and the approvals queue, including native command access and packaging. Bookmark and API-key deletion run directly; history clearing keeps its existing local confirmation. Existing browsing and media features remain.

Validation before packaging:
- Frontend: 61 tests passed across 12 files.
- Production frontend build: passed.
- Native Rust cargo check: passed after dependency removal.

The new graphical theme discussed in the conversation is a concept image, not implemented in this release.

Native Windows x64 NSIS installer build: passed. Portable archive verification is performed by scripts/package.py.
Native launch, installed-app interactions and upgrade/uninstall: not tested for this candidate. The installer is unsigned.
