// This document MUST stay on its separate origin; never serve it with the UI origin.
(() => {
  if (window.parent === window || location.origin !== 'https://www.youtube.com:444') return;
  let started = false;
  addEventListener('message', async event => {
    if (started || event.source !== parent || event.origin !== 'https://www.youtube.com' || event.data?.kind !== 'labeeb-token-start' || event.ports.length !== 1) return;
    started = true;
    const port = event.ports[0];
    const pending = new Map(); let sequence = 0;
    port.onmessage = ({data}) => {
      if (data?.kind !== 'response') return;
      const request = pending.get(data.id); if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new TypeError('Request refused'));
      else request.resolve(new Response(data.body, {status:data.status,headers:{'Content-Type':'application/json'}}));
    };
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.origin === 'https://www.google.com' && url.pathname.startsWith('/js/') && !url.username && !url.password && !url.hash) {
        return new Promise((resolve,reject) => {
          const tag = document.createElement('script');
          tag.src = url.href; tag.referrerPolicy = 'no-referrer';
          tag.onload = () => resolve(new Response('void 0;', {status:200}));
          tag.onerror = () => reject(new TypeError('Interpreter failed to load'));
          document.head.append(tag);
        });
      }
      const id = ++sequence;
      if (init.method !== 'POST' || typeof init.body !== 'string') throw new TypeError('Request refused');
      return new Promise((resolve,reject) => {
        pending.set(id,{resolve,reject});
        port.postMessage({kind:'fetch',id,url:url.href,body:init.body,headers:Object.fromEntries(new Headers(init.headers))});
      });
    };
    try {
      globalThis.__tokenArgs = event.data.args;
      const value = await (0,eval)(event.data.script);
      port.postMessage({kind:'result',value});
    } catch { port.postMessage({kind:'error'}); }
    finally { port.close(); }
  });
})();
