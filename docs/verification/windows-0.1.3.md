# Windows 0.1.3 — About Labeeb

Verified on 2026-11-13.

- Added a dedicated Arabic/English About page, accessible from the sidebar and Settings.
- Developer credit: شايع الشايع / Shaye Al-Shaye, Developer & AI Expert. Name spelling matches the local source of the supplied personal website.
- Personal website: https://alshaye.ai/. Native clicks open a managed browser tab rather than navigating the privileged shell. The website could not be retrieved by the review tools; remote website availability is not a claimed pass.
- Origin wording: Developed in Saudi Arabia, built with open-source technologies. No official certification badge is used.
- Preserved third-party acknowledgment and exposed the bundled application, Obscura and Tajawal license texts within the page.
- Version text now reads package metadata rather than a separate hardcoded Settings value.

## Completed checks

- TypeScript and all 26 frontend tests passed, including the native website-link routing regression.
- Production frontend and Windows x64/MSVC release/NSIS build passed; see `windows-about-build.log`.
- Portable native app launched; About page inspected through accessibility and a screenshot. Arabic name, role, website, origin wording and version 0.1.3 were confirmed in the rendered application.
- Original 0.1.2 user window was left untouched. The new app was left open for review.
- ZIP integrity, executable consistency and pinned sidecar hash are recorded in `windows-about-artifacts.json`.

Rust behavior did not change in this release; the 14 Rust and 9 real Windows CDP checks in the 0.1.2 record were not rerun. Installer install/uninstall, signing, macOS and live AI requests remain untested. This is an unsigned trial build.
