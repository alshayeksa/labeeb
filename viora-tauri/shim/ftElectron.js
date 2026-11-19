// Stand-in for Viora's Electron preload interface (src/preload/interface.js).
//
// Viora's interface talks to its Electron main process through `window.ftElectron`.
// Here the interface runs in WebView2 at the https://www.youtube.com origin, so
// its data and media requests are ordinary same-site requests. This file supplies
// the bridge: the data stores (kept by the host in SQLite), the proof-of-origin
// token, and the small window services the interface expects.
//
// The data store rules mirror Viora's src/datastores/handlers/base.js.
(() => {
  if (window.ftElectron) return;
  const log = (...args) => console.info('[viora-shim]', ...args);

  // The host hands the store token to this script only; nothing else may keep it.
  const token = window.__vioraBoot?.token ?? null;
  try { delete window.__vioraBoot; } catch { window.__vioraBoot = undefined; }

  // ---- no cookies -------------------------------------------------------------
  // Electron Viora strips YouTube's cookies from responses. Here every request the
  // interface makes is sent without credentials, so cookies are neither sent nor
  // stored. Requests to the host's own mount are left alone.
  const nativeFetch = window.fetch.bind(window);
  const ownPrefix = location.origin + '/__viora/';
  const withoutCredentials = realFetch => (input, init) => {
    const url = typeof input === 'string' ? new URL(input, location.href).href : input instanceof URL ? input.href : input.url;
    if (url.startsWith(ownPrefix)) return realFetch(input, init);
    if (input instanceof Request) return realFetch(new Request(input, { ...init, credentials: 'omit' }));
    return realFetch(input, { ...init, credentials: 'omit' });
  };
  window.fetch = withoutCredentials(nativeFetch);

  // ---- persistence backend ----------------------------------------------------
  const hostStore = async (op, collection, extra) => {
    const response = await nativeFetch(ownPrefix + '__api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Viora-Token': token },
      body: JSON.stringify({ op, collection, ...extra }),
    });
    if (!response.ok) throw new Error(`Store ${op} ${collection} failed: ${response.status} ${await response.text()}`);
    return response.json();
  };
  // Without a host store (plain browser preview) nothing is kept between runs.
  const memory = {};
  const backend = token ? {
    load: name => hostStore('load', name),
    put: (name, docs) => hostStore('put', name, { docs }),
    remove: (name, ids) => hostStore('delete', name, { ids }),
    replace: (name, docs) => hostStore('replace', name, { docs }),
  } : {
    load: async name => memory[name] ?? [], put: async () => {}, remove: async () => {}, replace: async () => {},
  };

  // ---- collections --------------------------------------------------------------
  const keyField = name => name === 'history' ? 'videoId' : '_id';
  const cache = {};
  const rows = name => (cache[name] ??= backend.load(name).then(list => Array.isArray(list) ? list : []));
  const idOf = (name, doc) => String(doc[keyField(name)]);
  const wrap = (name, doc) => ({ id: idOf(name, doc), body: doc });
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  const save = async (name, doc) => {
    const list = await rows(name);
    const index = list.findIndex(row => idOf(name, row) === idOf(name, doc));
    if (index >= 0) list[index] = doc; else list.push(doc);
    await backend.put(name, [wrap(name, doc)]);
  };
  const insert = async (name, data) => {
    const docs = (Array.isArray(data) ? data : [data]).map(clone);
    const list = await rows(name);
    for (const doc of docs) {
      if (doc[keyField(name)] === undefined || doc[keyField(name)] === null) doc[keyField(name)] = crypto.randomUUID();
      const index = list.findIndex(row => idOf(name, row) === idOf(name, doc));
      if (index >= 0) list[index] = doc; else list.push(doc);
    }
    if (docs.length) await backend.put(name, docs.map(doc => wrap(name, doc)));
    return Array.isArray(data) ? docs : docs[0];
  };
  const removeWhere = async (name, test) => {
    const list = await rows(name);
    const gone = list.filter(test);
    if (!gone.length) return;
    cache[name] = Promise.resolve(list.filter(row => !test(row)));
    await backend.remove(name, gone.map(row => idOf(name, row)));
  };
  const overwrite = async (name, records) => {
    const docs = (Array.isArray(records) ? records : []).map(clone);
    for (const doc of docs) if (doc[keyField(name)] === undefined || doc[keyField(name)] === null) doc[keyField(name)] = crypto.randomUUID();
    cache[name] = Promise.resolve(docs);
    await backend.replace(name, docs.map(doc => wrap(name, doc)));
  };
  /** Changes the documents matching `test`; with `upsertId`, creates the document when none matches. */
  const update = async (name, test, change, upsertId) => {
    const list = await rows(name);
    let targets = list.filter(test);
    if (!targets.length && upsertId !== undefined) {
      const created = { [keyField(name)]: upsertId };
      list.push(created);
      targets = [created];
    }
    for (const doc of targets) change(doc);
    if (targets.length) await backend.put(name, targets.map(doc => wrap(name, doc)));
  };
  const sorted = (list, field) => [...list].sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0));
  const unsetPlaylist = doc => { delete doc.lastViewedPlaylistId; delete doc.lastViewedPlaylistType; delete doc.lastViewedPlaylistItemId; };

  // Action numbers are DBActions in src/constants.js.
  const GENERAL = { CREATE: 0, FIND: 1, UPSERT: 2, DELETE: 3, DELETE_MULTIPLE: 4, DELETE_ALL: 5, OVERWRITE: 6 };
  const unknown = (name, action) => { log('unhandled store action', name, action); return null; };

  const dbSettings = async (action, data) => {
    switch (action) {
      case GENERAL.FIND: return clone((await rows('settings')).filter(row => row._id !== 'bounds'));
      case GENERAL.UPSERT:
        // Only the folder picker may set this one, as in the desktop program.
        if (data._id === 'screenshotFolderPath') return null;
        await save('settings', { _id: data._id, value: clone(data.value) });
        return null;
      default: return unknown('settings', action);
    }
  };
  const dbHistory = async (action, data) => {
    switch (action) {
      case GENERAL.FIND: return clone(sorted(await rows('history'), 'timeWatched'));
      case GENERAL.UPSERT: await save('history', clone(data)); return null;
      case GENERAL.OVERWRITE: await overwrite('history', data); return null;
      case 20: await update('history', row => row.videoId === data.videoId, doc => { doc.watchProgress = data.watchProgress; }, data.videoId); return null;
      case 21: await update('history', row => row.videoId === data.videoId, doc => {
        doc.lastViewedPlaylistId = data.lastViewedPlaylistId; doc.lastViewedPlaylistType = data.lastViewedPlaylistType; doc.lastViewedPlaylistItemId = data.lastViewedPlaylistItemId;
      }, data.videoId); return null;
      case 22: await update('history', row => data.videoIds.includes(row.videoId) && row.lastViewedPlaylistId === data.lastViewedPlaylistId, unsetPlaylist); return null;
      case 23: await update('history', row => data.includes(row.lastViewedPlaylistId), unsetPlaylist); return null;
      case GENERAL.DELETE: await removeWhere('history', row => row.videoId === data); return null;
      case GENERAL.DELETE_ALL: await overwrite('history', []); return null;
      default: return unknown('history', action);
    }
  };
  const dbProfiles = async (action, data) => {
    switch (action) {
      case GENERAL.CREATE: return clone(await insert('profiles', data));
      case GENERAL.FIND: return clone(await rows('profiles'));
      case GENERAL.UPSERT: await save('profiles', clone(data)); return null;
      case 20: await update('profiles', row => data.profileIds.includes(row._id), doc => { (doc.subscriptions ??= []).push(clone(data.channel)); }); return null;
      case 21: await update('profiles', row => data.profileIds.includes(row._id), doc => { doc.subscriptions = (doc.subscriptions ?? []).filter(channel => channel.id !== data.channelId); }); return null;
      case GENERAL.DELETE: await removeWhere('profiles', row => row._id === data); return null;
      default: return unknown('profiles', action);
    }
  };
  const dbPlaylists = async (action, data) => {
    const touch = (id, change) => update('playlists', row => row._id === id, change, id);
    switch (action) {
      case GENERAL.CREATE: return clone(await insert('playlists', data));
      case GENERAL.FIND: return clone(await rows('playlists'));
      case GENERAL.UPSERT: await touch(data._id, doc => Object.assign(doc, clone(data))); return null;
      case 20: await touch(data._id, doc => { (doc.videos ??= []).push(clone(data.videoData)); doc.lastUpdatedAt = data.lastUpdatedAt; }); return null;
      case 21: await touch(data._id, doc => { (doc.videos ??= []).push(...clone(data.videos)); doc.lastUpdatedAt = data.lastUpdatedAt; }); return null;
      case 22: {
        if (data.playlistItemId == null && data.videoId == null) throw new Error(`Both videoId & playlistItemId are absent, _id: ${data._id}`);
        await touch(data._id, doc => {
          doc.videos = (doc.videos ?? []).filter(video => data.playlistItemId != null ? video.playlistItemId !== data.playlistItemId : video.videoId !== data.videoId);
          doc.lastUpdatedAt = data.lastUpdatedAt;
        });
        return null;
      }
      case 23: await touch(data._id, doc => { doc.videos = (doc.videos ?? []).filter(video => !data.playlistItemIds.includes(video.playlistItemId)); doc.lastUpdatedAt = data.lastUpdatedAt; }); return null;
      case 24: await touch(data, doc => { doc.videos = []; }); return null;
      case GENERAL.DELETE: await removeWhere('playlists', row => row._id === data && row.protected !== true); return null;
      case GENERAL.DELETE_MULTIPLE: await removeWhere('playlists', row => data.includes(row._id) && row.protected !== true); return null;
      case GENERAL.DELETE_ALL: await overwrite('playlists', []); return null;
      default: return unknown('playlists', action);
    }
  };
  const dbSearchHistory = async (action, data) => {
    switch (action) {
      case GENERAL.FIND: return clone(sorted(await rows('searchHistory'), 'lastUpdatedAt'));
      case GENERAL.UPSERT: await save('searchHistory', clone(data)); return null;
      case GENERAL.OVERWRITE: await overwrite('searchHistory', data); return null;
      case GENERAL.DELETE: await removeWhere('searchHistory', row => row._id === data); return null;
      case GENERAL.DELETE_ALL: await overwrite('searchHistory', []); return null;
      default: return unknown('searchHistory', action);
    }
  };
  const dbSubscriptionCache = async (action, data) => {
    const set = (fields) => update('subscriptionCache', row => row._id === data.channelId, doc => Object.assign(doc, fields), data.channelId);
    switch (action) {
      case GENERAL.FIND: return clone(await rows('subscriptionCache'));
      case 20: await set({ videos: clone(data.entries), videosTimestamp: data.timestamp }); return null;
      case 21: await set({ liveStreams: clone(data.entries), liveStreamsTimestamp: data.timestamp }); return null;
      case 22: await set({ shorts: clone(data.entries), shortsTimestamp: data.timestamp }); return null;
      case 23: await update('subscriptionCache', row => row._id === data.channelId && Array.isArray(row.shorts), doc => {
        for (const cached of doc.shorts) {
          const fresh = data.entries.find(short => cached.videoId === short.videoId);
          if (!fresh) continue;
          cached.title = fresh.title; cached.author = fresh.author;
          if (fresh.viewCount > cached.viewCount) cached.viewCount = fresh.viewCount;
        }
      }); return null;
      case 24: await set({ communityPosts: clone(data.entries), communityPostsTimestamp: data.timestamp }); return null;
      case GENERAL.DELETE_MULTIPLE: await removeWhere('subscriptionCache', row => data.includes(row._id)); return null;
      case GENERAL.DELETE_ALL: await overwrite('subscriptionCache', []); return null;
      default: return unknown('subscriptionCache', action);
    }
  };

  // A distinct port gives the interpreter its own origin, without parent/store access.
  // BotGuard needs the YouTube hostname; an opaque sandbox origin cannot mint tokens.
  let botGuardScript;
  let tokenJobActive = false;
  const generatePoToken = async (videoId, context, initialAttestationData, ytConfig) => {
    if (tokenJobActive) throw new Error('Token generation already running');
    tokenJobActive = true;
    let frame, channel, timer;
    const controller = new AbortController();
    try {
      if (!botGuardScript) {
        const source = await (await nativeFetch(ownPrefix + 'botGuardScript.js')).text();
        const match = source.match(/export\s*\{\s*([\w$]+)\s+as\s+default\s*\};?/);
        if (!match) throw new Error('BotGuard script has an unexpected shape');
        botGuardScript = source.replace(match[0], `;${match[1]}(...globalThis.__tokenArgs)`);
      }
      const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
      const args = [videoId, parse(context), parse(initialAttestationData), parse(ytConfig)];
      if (JSON.stringify(args).length > 2000000) throw new Error('Token input too large');
      frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;visibility:hidden';
      frame.setAttribute('aria-hidden', 'true');
      const helperOrigin = 'https://www.youtube.com:444';
      frame.src = helperOrigin + '/__viora/__shim/token-helper.html';
      const result = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Token generation timed out')), 90000);
        frame.onerror = () => reject(new Error('Token helper failed to load'));
        frame.onload = () => {
          channel = new MessageChannel();
          let requests = 0;
          const allowed = new Set([
            'https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false&alt=json',
            'https://www.youtube.com/api/jnn/v1/GenerateIT',
          ]);
          channel.port1.onmessage = async ({data}) => {
            if (!data || typeof data !== 'object') return;
            if (data.kind === 'result') {
              if (typeof data.value !== 'string' || !data.value.length || data.value.length > 65536) reject(new Error('Invalid token result'));
              else resolve(data.value);
            } else if (data.kind === 'error') reject(new Error('Token helper failed'));
            else if (data.kind === 'fetch') {
              try {
                if (++requests > 8 || !Number.isSafeInteger(data.id) || !allowed.has(data.url) || typeof data.body !== 'string' || data.body.length > 2000000) throw new Error('Request refused');
                const headers = {};
                const names = new Set(['accept', 'content-type', 'x-goog-visitor-id', 'x-youtube-client-version', 'x-youtube-client-name', 'x-goog-api-key', 'x-user-agent']);
                for (const [name, value] of Object.entries(data.headers || {})) {
                  if (!names.has(name.toLowerCase()) || typeof value !== 'string' || value.length > 8192) throw new Error('Header refused');
                  headers[name] = value;
                }
                const response = await nativeFetch(data.url, {method:'POST', headers, body:data.body, credentials:'omit', redirect:'error', signal:controller.signal});
                const reader = response.body.getReader();
                const chunks = []; let size = 0;
                while (true) {
                  const {done,value} = await reader.read(); if (done) break;
                  size += value.length;
                  if (size > 2000000) { await reader.cancel(); throw new Error('Response too large'); }
                  chunks.push(value);
                }
                const bytes = new Uint8Array(size); let offset = 0;
                for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
                channel.port1.postMessage({kind:'response',id:data.id,status:response.status,body:new TextDecoder().decode(bytes)});
              } catch { channel?.port1.postMessage({kind:'response',id:data.id,error:true}); }
            }
          };
          frame.contentWindow.postMessage({kind:'labeeb-token-start',script:botGuardScript,args}, helperOrigin, [channel.port2]);
        };
        document.body.append(frame);
      });
      const value = await result;
      state.poTokens += 1;
      return value;
    } catch (error) {
      state.lastPoTokenError = String(error);
      throw error;
    } finally {
      clearTimeout(timer); controller.abort(); channel?.port1.close(); frame?.remove(); tokenJobActive = false;
    }
  };

  const playerCache = new Map();
  const handlers = {};
  const on = name => handler => { handlers[name] = handler; };
  const state = { poTokens: 0, lastPoTokenError: null, unknownCalls: [], persistent: !!token };
  window.__vioraProto = state;

  const api = {
    // Viora's own download panel. Its state is always a valid, empty one. When the
    // interface is hosted by Labeeb, starting a download hands the video to Labeeb's
    // downloader, which asks for the quality in its own trusted window.
    download: async (action) => {
      if (action === 'start' && window.__labeebVideoOverlay) {
        const id = /^#\/watch\/([\w-]{11})/.exec(location.hash)?.[1];
        if (id) location.href = 'labeeb-video://request?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id);
      }
      return { folder: '', jobs: [], files: [] };
    },
    getSystemLocale: async () => navigator.language,
    isWaylandPlatform: async () => false,
    openInNewWindow: () => log('openInNewWindow is not available'),
    enableProxy: () => {}, disableProxy: () => {},
    setInvidiousAuthorization: () => {}, clearInvidiousAuthorization: () => {},
    startPowerSaveBlocker: () => {}, stopPowerSaveBlocker: () => {},
    getReplaceHttpCache: async () => false,
    getDisableHardwareAcceleration: async () => false,
    toggleReplaceHttpCache: () => {}, toggleDisableHardwareAcceleration: () => {},
    requestPiP: () => { try { document.querySelector('video.player')?.ui.getControls().togglePiP(); } catch (e) { log(e); } },
    requestFullscreen: () => { try { document.querySelector('video.player')?.ui.getControls().toggleFullScreen(); } catch (e) { log(e); } },
    playerCacheGet: async key => playerCache.get(key),
    playerCacheSet: async (key, value) => { playerCache.set(key, value); },
    generatePoToken,
    chooseDefaultFolder: () => {}, writeToDefaultFolder: async () => {},
    relaunch: () => location.reload(),
    openInExternalPlayer: () => {}, handleOpenInExternalPlayerResult: on('externalPlayerResult'),
    setZoomFactor: () => {},
    getNavigationHistory: async () => [],
    dbSettings, dbHistory, dbProfiles, dbPlaylists, dbSearchHistory, dbSubscriptionCache,
    handleChangeView: on('changeView'), handleOpenUrl: on('openUrl'), handleUpdateSearchInputText: on('updateSearchInputText'),
    handleSyncSettings: on('syncSettings'), handleSyncHistory: on('syncHistory'), handleSyncSearchHistory: on('syncSearchHistory'),
    handleSyncProfiles: on('syncProfiles'), handleSyncPlaylists: on('syncPlaylists'), handleSyncSubscriptionCache: on('syncSubscriptionCache'),
  };

  // Anything not provided yet is reported instead of crashing the interface.
  window.ftElectron = new Proxy(api, {
    get(target, name) {
      if (name in target) return target[name];
      if (typeof name !== 'string') return undefined;
      return (...args) => { state.unknownCalls.push(name); log('missing bridge function', name, args); return Promise.resolve(undefined); };
    },
  });
  log('bridge ready at', location.origin, token ? '(host store)' : '(no host store)');
})();
