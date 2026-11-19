# Labeeb 0.1.38 - Video download progress and stalls

## Findings
- The running 0.1.37 downloader had a zero-byte partial MP4 unchanged across repeated observations. Its original process was left running; the underlying connection stall was not conclusively diagnosed.
- yt-dlp --print suppresses normal progress unless --progress is explicitly enabled. Labeeb omitted that flag and parsed progress only from stdout.
- A fresh limited transfer of the affected video succeeded. This establishes current reachability, not completion of the user's 463 MiB download.

## Changes
- Explicit progress output, parsed from both stdout and stderr.
- Explicit postprocessing marker compatible with quiet/print mode, exposing the merging state.
- A watchdog checks actual temporary-file size every five seconds. After 180 seconds without file-size change (600 during postprocessing), it stops that job with an explanatory error, allowing the queue to continue. Repeated warning/retry messages do not reset it.
- Existing downloads and the running app were not stopped. Applying the new binary requires restarting; the current in-memory queue is not migrated or persisted by this change.

## Verification
- Rust library: 45 passed, 4 ignored.
- Explicit live video integration test: passed. The actual VideoManager downloaded, merged and saved a short public YouTube video (jNQXAC9IVRw), using the installed verified tools and a temporary output directory.
- Limited transfer of the user's video: succeeded with progress and postprocessing markers (video-fixed2-probe.log).
- Watchdog timing and progress/postprocessing parser tests passed.
- No frontend source changes in this release; prior frontend suite: 148 passed, 1 skipped.
- Production build uses Tauri CLI. Store installation/certification is not tested here.

Reference: https://github.com/yt-dlp/yt-dlp#usage-and-options
