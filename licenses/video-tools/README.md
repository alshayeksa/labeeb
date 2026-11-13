# Optional video tools

Labeeb launches these upstream tools as separate processes only for requested downloads. No Viora/FreeTube application code is copied into Labeeb.

- yt-dlp 2026.08.19: https://github.com/yt-dlp/yt-dlp/tree/2026.08.19
- Node.js 24.22.2: https://github.com/nodejs/node/tree/v24.22.2
- FFmpeg 9.0.2 source: https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz
- FFmpeg Windows build scripts/configuration: https://github.com/GyanD/codexffmpeg

See accompanying license notices, executable hashes in `src-tauri/src/video.rs`, and upstream release URLs in that file. Executables are downloaded directly from upstream at first use; they are not included in the standard Labeeb installer.
