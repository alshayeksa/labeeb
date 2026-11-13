# Labeeb 0.1.6 — compact About page

The About overview now uses two adjacent compact cards for the browser identity and developer. The origin statement, license disclosure, version, and signature remain on the same page. Removed the long introduction and three descriptive feature sections. License content scrolls within its disclosure instead of extending the whole overview. Short-window styles reduce spacing and logo size while retaining the developer name, role, website and attribution.

TypeScript and all 36 existing frontend tests passed (`about-compact-check.log`). Native build and NSIS packaging: `windows-0.1.6-build.log`. No backend behavior changed; native interaction and pixel-level fit at every window size were not manually verified for this revision. The Windows installer remains unsigned; macOS was not built.
