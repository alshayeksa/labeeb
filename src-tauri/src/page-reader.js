(() => {
  try {
    const request = /*READER_REQUEST*/;
    if (location.href !== request.url || window.top !== window || !/^https?:$/.test(location.protocol)) return { error: 'READER_PAGE_CHANGED' };
    const blocked = 'script,style,noscript,template,input,textarea,select,button,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],iframe,object,embed,svg,canvas';
    let budget = 24000, visited = 0, truncated = false;
    const redact = s => s.replace(/\b(?:sk-[\w-]{12,}|Bearer\s+[\w.+/=-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/gi, '[redacted]')
      .replace(/\b(password|passwd|api[_ -]?key|access[_ -]?token|secret)\s*[:=]\s*\S+/gi, '$1: [redacted]');
    const safe = el => {
      if (!el || el.closest(blocked)) return false;
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
      }
      return el.getClientRects().length > 0;
    };
    const clip = (s, limit = 6000) => {
      s = redact(s).trim(); const n = Math.min(budget, limit);
      if (s.length > n) truncated = true;
      const result = s.slice(0, n); budget -= result.length; return result;
    };
    const text = (root, range) => {
      if (!root || budget <= 0) return '';
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node, parts = [], count = 0;
      while ((node = walker.nextNode()) && visited++ < 16000 && count < 10000) {
        if (!safe(node.parentElement) || (range && !range.intersectsNode(node))) continue;
        let value = node.textContent || '';
        if (range) {
          const start = node === range.startContainer ? range.startOffset : 0;
          const end = node === range.endContainer ? range.endOffset : value.length;
          value = value.slice(start, end);
        }
        value = value.replace(/\s+/g, ' ').trim();
        if (value) { parts.push(value); count += value.length; }
      }
      if (visited >= 16000 || count >= 10000) truncated = true;
      return clip(parts.join('\n'));
    };
    const selection = window.getSelection();
    const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
    const selected = range ? text(document.body, range) : '';
    const result = { title: clip(document.title, 300), origin: location.origin, selected, text: '', headings: [], links: [], tables: [], truncated: false };
    if (!request.selectionOnly) {
      if (document.querySelectorAll('table').length > 12 || document.querySelectorAll('h1,h2,h3,h4,h5,h6').length > 80 || document.querySelectorAll('a[href]').length > 100) truncated = true;
      for (const table of Array.from(document.querySelectorAll('table')).slice(0, 12)) {
        if (!safe(table)) continue;
        const rows = Array.from(table.rows).slice(0, 100).filter(safe).map(row => {
          if (row.cells.length > 30) truncated = true;
          return Array.from(row.cells).slice(0, 30).map(cell => text(cell));
        });
        if (table.rows.length > 100) truncated = true;
        result.tables.push(rows);
      }
      result.headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).slice(0, 80).filter(safe).map(el => text(el));
      for (const el of Array.from(document.querySelectorAll('a[href]')).slice(0, 100)) {
        if (!safe(el)) continue;
        try { const url = new URL(el.href); if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
          result.links.push({ text: text(el), url: clip(url.origin + url.pathname, 500) });
        } catch { /* Invalid link. */ }
      }
      result.text = text(document.querySelector('article,main,[role="main"]') || document.body);
    }
    result.truncated = truncated || budget <= 0;
    if (location.href !== request.url) return { error: 'READER_PAGE_CHANGED' };
    if (!result.text && !result.selected && !result.tables.length) return { error: request.selectionOnly ? 'READER_NO_SELECTION' : 'READER_UNSUPPORTED' };
    return result;
  } catch { return { error: 'READER_UNSUPPORTED' }; }
})()
