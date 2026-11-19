# Viora on Tauri — prototype

A separate experiment that lives beside Labeeb. It does not change Labeeb, and it
does not change the original Viora project (`D:\projects\Viora`), which is only
read from.

## The question

Can Viora (a FreeTube fork built on Electron) run on the same technology as
Labeeb — Tauri, Rust and WebView2 — and still play YouTube videos?

## The answer so far: yes

Tested on 13 November 2026 with Viora's unmodified, already-built interface:

| Step | Result |
|---|---|
| Interface starts and renders (Arabic, RTL) | Works |
| Watch page data fetched from YouTube | Works |
| Proof-of-origin token (BotGuard) minted | Works, about 0.2–0.3 s |
| Stream loaded by the Shaka player | Works |
| `jNQXAC9IVRw` (19 s, 240p) | Played to the end |
| `aqz-KE-bpKQ` (10 min, 720p, with sound) | Playing; advanced 3.0 s in 3.0 s, 128 s buffered |

See “State” below for what else was tried and what does not work.

## How it works

Electron Viora loads its interface from `app://bundle/`, turns web security off
and rewrites request headers so YouTube accepts its requests.

This host instead serves the same files at `https://www.youtube.com/__viora/…`
(WebView2 `WebResourceRequested`). The interface therefore runs with YouTube's
real origin: its requests are ordinary same-site requests, web security stays
on, and nothing is proxied or rewritten. The page gets no Tauri commands.

- `../src-tauri/src/viora_host.rs` (in Labeeb) — the host: the file mount and the document store. Labeeb uses it for the Viora tab.
- `src-tauri/src/main.rs` — a single test window around that same host.
- `shim/ftElectron.js` — stand-in for Viora's Electron preload bridge
  (`window.ftElectron`): data stores, credential-free requests, and token
  generation in a hidden same-site frame.
- `app/` — a copy of Viora's `dist` build (not in git; see below).
- `tools/prepare-app.mjs` — makes that copy and decompresses its `.json.br` files.
- `tools/cdp_inspect.py` — reads the page's console, state and a screenshot
  through the WebView2 debugging port.

## Run it

```powershell
node tools\prepare-app.mjs D:\projects\Viora      # once, or after rebuilding Viora
cd src-tauri
$env:VIORA_PROTO_START = "#/watch/jNQXAC9IVRw"     # optional: open a video
cargo run --features tauri/custom-protocol
```

To inspect it, also set `$env:VIORA_PROTO_DEBUG_PORT = "9333"` before running, then:

```powershell
..\..\.build-venv\Scripts\python.exe ..\tools\cdp_inspect.py 9333 10 --shot out.png
```

The debugging port lets any local program control the page. Use it only while testing.

## State on 13 November 2026

Done and checked in the running program:

- **Storage in Rust.** Settings, history, profiles, playlists, search history and
  the subscription cache are kept by the host in SQLite (`viora.sqlite`), through
  one endpoint under the mount that needs a per-run token. The rules mirror
  Viora's `src/datastores/handlers/base.js`. A watched video and its position
  were still in History after a reload.
- **No cookies.** The bridge sends every request without credentials and the host
  clears the profile's cookies when it mounts. The cookie count stayed at 0 after
  playing videos.
- **Pages tried:** watch (two videos), search, channel, trending, most popular,
  playlist, subscriptions (empty), history, settings. All rendered with data.
- **Inside Labeeb.** Labeeb opens Viora as a tab in its own engine profile
  (`viora-profile`), shown in the address bar as `viora:/…`. Asking for a video
  from Labeeb changed the tab to that video and its title.

Not working or not done:

1. **Live streams do not play.** Their segments are fetched from an address that
   redirects to another server, and the browser refuses the redirected reply
   (no `Access-Control-Allow-Origin`). Electron Viora avoids this by turning web
   security off. The fix is a narrow fetch through the host for
   `*.googlevideo.com` live segments only.
2. **Viora's own download panel** is empty. Inside Labeeb, its start action hands
   the video to Labeeb's downloader instead.
3. **Not provided yet:** external player, multiple windows, proxy settings,
   power-save blocker, zoom, in-app navigation history, updates, import of data
   from an installed Electron Viora.
4. **Not tried:** age-restricted videos, comments, shorts, channel sub-tabs,
   subscribing and the subscription feed with real channels, playlists you create.
5. **Consent.** Without cookies, YouTube's consent choice is not sent. In regions
   that require it (the EU), the watch page may redirect to a consent page.
6. **Upkeep.** YouTube changes its player and BotGuard regularly; this depends on
   the same libraries Viora uses (youtubei.js, bgutils-js, googlevideo).

## Licence

`app/` is Viora, a modified FreeTube: AGPL-3.0-or-later. The host and bridge here
are written to run that program and are offered under the same licence. Labeeb
itself is Apache-2.0 and shares no code with this folder; keep it that way unless
Labeeb is meant to become AGPL as well.
