// Top-level HTTPS login forms only. No credential capture while Labeeb saving is off.
(() => {
  if (window.top !== window || location.protocol !== 'https:' || !window.chrome?.webview) return;
  const bridge = window.chrome.webview;
  // Wry's earlier WebMessageReceived handler expects strings. An object can
  // fail there before our native handler receives it.
  const send = packet => bridge.postMessage(JSON.stringify(packet));
  const traceEnabled = false;
  if (traceEnabled) window.__labeebPasswordTraceReady = true;
  let traces = 0;
  const trace = code => { if (traceEnabled && traces++ < 30) send({ kind: 'labeeb-password-trace', code }); };
  trace('script_ready');
  let enabled = false;
  let last = 0;
  bridge.addEventListener('message', event => {
    if (event.data?.kind === 'labeeb-password-config') { enabled = event.data.enabled === true; trace(enabled ? 'config_on' : 'config_off'); }
  });
  const ready = () => send({ kind: 'labeeb-password-ready' });
  ready();
  // The native source can still be about:blank at document creation. Retry once
  // the document exists, and on BFCache restores; never assume saving is on.
  document.addEventListener('DOMContentLoaded', ready, { once: true });
  window.addEventListener('pageshow', ready);
  const capture = (event, form, submitter) => {
    if (!enabled) { trace('saving_off'); return; }
    if (!event.isTrusted || Date.now() - last < 10000) return;
    if (!(form instanceof HTMLFormElement)) { trace('no_form'); return; }
    const visible = input => !input.disabled && input.getClientRects().length > 0;
    const passwords = Array.from(form.querySelectorAll('input[type="password"]')).filter(visible);
    // Skip sign-up/reset forms, hidden fields and ambiguous multi-password forms.
    if (passwords.length !== 1 || passwords[0].autocomplete === 'new-password') { trace('password_shape'); return; }
    const password = passwords[0];
    if (!password.value || password.value.length > 1024) { trace('password_empty'); return; }
    const action = new URL(submitter?.getAttribute('formaction') || form.action || location.href, location.href);
    if (action.origin !== location.origin || action.protocol !== 'https:') { trace('action_rejected'); return; }
    const users = Array.from(form.querySelectorAll('input')).filter(input => visible(input) && ['text', 'email', 'tel'].includes(input.type));
    const username = users.find(input => input.autocomplete === 'username') || users.find(input => input.type === 'email') || (users.length === 1 ? users[0] : null);
    if (!username?.value.trim() || username.value.length > 512) { trace('username_missing'); return; }
    trace('proposal_sent');
    last = Date.now();
    send({ kind: 'labeeb-password-save', username: username.value.trim(), password: password.value });
  };
  document.addEventListener('submit', event => { trace('submit'); capture(event, event.target, event.submitter); }, true);
  // Capture intent before page handlers clear fields or call form.submit(),
  // which does not dispatch a submit event. Do not intercept/submit the form.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('button, input[type="submit"], input[type="image"]');
    if (!button) return;
    trace('click');
    if (button.disabled || !['submit', 'image'].includes(button.type)) { trace('button_not_submit'); return; }
    if (!button.form) trace('no_form');
    else if (!button.formNoValidate && !button.form.noValidate && !button.form.checkValidity()) trace('invalid_form');
    if (button.form && (button.formNoValidate || button.form.noValidate || button.form.checkValidity())) capture(event, button.form, button);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.repeat || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    trace('enter');
    const input = event.target;
    if (input?.tagName !== 'INPUT' || !['password', 'text', 'email', 'tel'].includes(input.type)) return;
    const form = input.form;
    const submitter = form?.querySelector('button:not([type]), button[type="submit"], input[type="submit"], input[type="image"]');
    if (submitter?.disabled) return;
    if (form && (form.noValidate || submitter?.formNoValidate || form.checkValidity())) capture(event, form, submitter);
  }, true);
})();
