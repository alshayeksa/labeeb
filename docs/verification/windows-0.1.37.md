# Labeeb 0.1.37 - Assistant layout

The assistant now gives conversation content the available vertical space, keeps a compact auto-growing composer below it, collapses reading-source details by default, and supports resizing its width with pointer and keyboard controls. Assistant answers render Markdown lists and tables; raw HTML, images and navigation links are disabled.

## Validation

- TypeScript and frontend tests: 148 passed, 1 skipped (assistant-layout-tests.log).
- The unchanged Rust implementation previously passed 43 tests with 4 ignored in 0.1.36.
- Native visual/drag QA was not completed: computer-use URL verification prevented the preview session. Automated coverage does not replace native visual verification.
- No performance improvement is claimed.
- Windows production build uses Tauri CLI. MSIX packaging validates the package and compares the embedded executable. This task does not install or publish the Store package.

Production frontend license texts are included in licenses/Frontend-dependencies.txt.
