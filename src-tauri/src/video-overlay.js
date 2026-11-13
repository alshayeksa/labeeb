(() => {
  if (!/^https?:$/.test(location.protocol) || window.__labeebVideoOverlay) return;
  window.__labeebVideoOverlay = true;
  const start = () => {
    const host = document.createElement('div');
    host.setAttribute('data-labeeb-video-buttons', '');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    const shadow = host.attachShadow({mode:'closed'});
    const style = document.createElement('style');
    style.textContent = 'button{position:fixed;pointer-events:auto;background:#123d35;color:#fff;border:1px solid #7be0c8;border-radius:9px;padding:9px 14px;font:600 14px system-ui;box-shadow:0 3px 12px #0005;cursor:pointer;direction:rtl}button:hover,button:focus-visible{background:#216a5b;outline:2px solid #b7f7e7}button:disabled{background:#414750;border-color:#8b939e;cursor:help}';
    shadow.append(style); document.documentElement.append(host);
    const entries = new Map(); let scheduled = false; let scanTimer;
    const source = video => {
      const local = new URL(location.href);
      if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','www.youtube-nocookie.com'].includes(local.hostname)) {
        const parts = local.pathname.split('/').filter(Boolean);
        const id = local.searchParams.get('v') || (['shorts','embed','live'].includes(parts[0]) ? parts[1] : '');
        if (/^[\w-]{11}$/.test(id || '')) return 'https://www.youtube.com/watch?v=' + id;
      }
      const raw = video.currentSrc || video.src || video.querySelector('source')?.src;
      try { const u = new URL(raw); return u.protocol === 'https:' && !/\.(m3u8|mpd)$/i.test(u.pathname) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
    };
    const place = () => {
      scheduled = false;
      if (document.hidden) return;
      for (const [video, button] of entries) {
        const r = video.getBoundingClientRect();
        const visible = video.isConnected && r.width >= 160 && r.height >= 90 && r.bottom > 45 && r.top < innerHeight - 30 && r.right > 120 && r.left < innerWidth - 30;
        button.hidden = !visible;
        if (visible) {
          button.style.top = Math.max(8, r.top + 10) + 'px';
          button.style.left = Math.max(8, Math.min(innerWidth - 160, r.right - 150)) + 'px';
          button.disabled = !source(video);
          button.textContent = button.disabled ? 'تحميل غير متاح' : '↓ تحميل الفيديو';
          button.title = button.disabled ? 'هذا الفيديو يستخدم بثًا محميًا أو رابطًا غير مباشر غير مدعوم حاليًا' : 'تحميل بواسطة لبيب';
        }
      }
    };
    const schedule = () => { if (!scheduled && !document.hidden) { scheduled = true; requestAnimationFrame(place); } };
    const resize = new ResizeObserver(schedule);
    const scan = () => {
      for (const [video, button] of entries) if (!video.isConnected) { resize.unobserve(video); button.remove(); entries.delete(video); }
      for (const video of document.querySelectorAll('video')) {
        if (entries.has(video) || entries.size >= 40) continue;
        const button = document.createElement('button'); button.type = 'button';
        button.addEventListener('click', event => {
          if (!event.isTrusted) return;
          event.preventDefault(); event.stopPropagation();
          const url = source(video);
          if (url) location.href = 'labeeb-video://request?url=' + encodeURIComponent(url);
        });
        shadow.append(button); entries.set(video, button); resize.observe(video);
      }
      schedule();
    };
    new MutationObserver(records => {
      if (records.every(r => r.target === host)) return;
      clearTimeout(scanTimer); scanTimer = setTimeout(scan, 180);
    }).observe(document.documentElement, {childList:true, subtree:true});
    document.addEventListener('loadedmetadata', schedule, true);
    document.addEventListener('play', schedule, true);
    document.addEventListener('visibilitychange', schedule);
    document.addEventListener('yt-navigate-finish', scan);
    window.addEventListener('popstate', scan);
    window.addEventListener('scroll', schedule, {capture:true, passive:true});
    window.addEventListener('resize', schedule, {passive:true});
    scan();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
