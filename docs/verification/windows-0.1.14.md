# Labeeb 0.1.14 Windows candidate

- Removed hide-sidebar, More and diagnostics navigation; sidebar supports compact/expanded modes and migrates old hidden preferences to compact.
- About appears directly below Settings and was removed from the Settings content.
- Arabic/English controls sit to the left of the brand; Viora includes its ad-free YouTube subtitle.
- Custom SVG glyphs share a 24-unit grid and rounded 1.65-unit strokes; Settings uses a gear.
- The assistant unmounts when closed; the main area consumes the remaining flex width and native bounds are recomputed.

Validation: 60 frontend tests passed across 11 files. Production frontend build and native Windows x64 NSIS build passed. Portable archive integrity is checked by scripts/package.py.
Visual preview was attempted but browser-host access was unavailable and native window activation failed. No visual or installed-app smoke-test pass is claimed.
