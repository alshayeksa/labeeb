# Third-party notices

Project source: Apache-2.0 (LICENSE). This is an initial inventory; review the exact locked dependency graph and preserve all required notices before public distribution.

- Tauri: Apache-2.0 OR MIT. Retain exact locked package notices.
- React, TypeScript, Vite and frontend dependencies: retain licenses from exact locked packages.
- Tajawal: SIL OFL 1.1, `licenses/Tajawal-OFL.txt`. Do not claim trademark ownership.
- WebView2/Windows runtime and WKWebView/macOS frameworks: vendor terms, not relicensed by this project.


Labeeb logo: user-approved artwork supplied for this project; platform icon files were generated with Tauri icon tooling.


## Optional video download tools
The independent Rust downloader launches yt-dlp, FFmpeg and Node on demand. The standard installer does not bundle these executables. See licenses/video-tools/README.md and accompanying upstream notices. The downloader itself contains no Viora/FreeTube code.

## Viora (bundled resources)
Viora is a modified FreeTube: AGPL-3.0-or-later, `licenses/Viora-AGPL-3.0.txt`. Its built interface and bridge script are shipped in the separate `viora/` folder and loaded at run time in their own tab; they are not compiled into Labeeb, whose own source stays Apache-2.0. Anyone who distributes this package must also offer Viora's complete corresponding source under the AGPL. Viora is not affiliated with Google or YouTube.
# Markdown rendering

The assistant uses react-markdown (MIT) and remark-gfm (MIT). License texts for installed production frontend dependencies are retained in `licenses/Frontend-dependencies.txt`.
