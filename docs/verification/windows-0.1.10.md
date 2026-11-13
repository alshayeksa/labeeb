# Labeeb 0.1.10 — YouTube downloads

Adds a trusted-shell YouTube download panel and contextual toolbar button. Supports a single video, Shorts, 720p/1080p maximum quality as available, and M4A audio. Downloads run one at a time; up to ten pending/active jobs. A native folder picker selects the destination. Progress, cancellation and manual retry are available in Downloads.

The Rust implementation is independent of Viora's Electron code. It uses the same pinned upstream tools: yt-dlp 2026.08.19, Node 24.22.2 and FFmpeg 9.0.2. First use downloads and SHA-256 verifies approximately 227 MB of tools/archive data; installed executables occupy approximately 217 MB. No downloader or media process starts at browser launch. Tools remain on disk for reuse. An optional `video-tools` directory alongside the executable can provision the same hash-verified files offline.

Only canonical public YouTube video URLs reach the downloader. The app passes fixed arguments without a shell, ignores external yt-dlp configuration, rejects playlists/live streams, and never imports browser cookies. Remote page webviews have no access to these commands. Partial media lives in a unique per-job directory. Final files use exclusive creation, unique names, and retain the chosen extension. Cancellation terminates the downloader process tree. Closing the browser stops active video jobs; jobs are not restored after restart.

Validation:
- Frontend typecheck and 48 tests passed.
- Rust release suite: 25 tests passed, including a real YouTube video download and existing real Obscura lifecycle tests.
- First sample video was unavailable upstream; the downloader correctly failed. Replaced the sample with the public 18-second `jNQXAC9IVRw` video and verified an MP4 was produced.
- Real M4A download with verified existing tools passed (`video-audio-test.log`).
- Cold Internet provisioning fetched and verified yt-dlp, but the Node transfer was interrupted after 414 seconds. The job correctly reported failure; full remote provisioning is NOT verified on this network. Direct independent requests to nodejs.org also returned connection resets. The local optional pack was verified through the native application.
- Release/NSIS build succeeded (31.18 MiB installer).
- Native 0.1.10: light/dark download form inspected, an MP4 download completed (533,931 bytes), a second active job was cancelled, its temporary directory was removed, and no Labeeb yt-dlp/FFmpeg/Node process remained.
- Native optional pack copied into app data on first use and passed executable hashes. The folder-picker dialog and 1080p were not exercised end-to-end.

Limits: Windows x64 only for video downloads; other websites, DRM, authenticated videos, playlists, live streams and resumable persistent jobs are not implemented. YouTube can require verification or change its extractor behavior. The installer remains unsigned. No comparative RAM/CPU benchmark against other browsers was performed.
