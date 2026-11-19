// Detect login forms without reading or sending any field values.
(() => {
  if (window.top !== window || location.protocol !== 'https:' || !window.chrome?.webview) return;
  let timer = null, previous = null, previousUrl = '';
  const scan = () => {
    timer = null;
    if (document.hidden) return;
    const inputs = Array.from(document.querySelectorAll('input[type="password"]')).filter(input => !input.disabled && !input.readOnly && input.getClientRects().length);
    if (inputs.length !== 1 || inputs[0].autocomplete === 'new-password') return;
    const password = inputs[0], form = password.form;
    if (!form || new URL(form.action || location.href, location.href).origin !== location.origin) return;
    if (previous === password && previousUrl === location.href) return;
    previous = password; previousUrl = location.href;
    window.chrome.webview.postMessage(JSON.stringify({ kind: 'labeeb-password-form' }));
  };
  const schedule = () => { if (timer === null) timer = setTimeout(scan, 200); };
  const start = () => {
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  document.addEventListener('focusin', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { previous = null; schedule(); } });
  window.addEventListener('pageshow', () => { previous = null; schedule(); });
  window.chrome.webview.addEventListener('message', event => {
    if (event.data?.kind === 'labeeb-password-config') { previous = null; schedule(); }
  });
})();
