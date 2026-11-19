(() => {
  const login = /*LOGIN_DATA*/;
  if (window.top !== window || location.href !== login.url || location.protocol !== 'https:') return false;
  const visible = input => !input.disabled && !input.readOnly && input.getClientRects().length > 0;
  const passwords = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);
  if (passwords.length !== 1 || passwords[0].autocomplete === 'new-password') return false;
  const password = passwords[0], form = password.form;
  if (!form || new URL(form.action || location.href, location.href).origin !== location.origin) return false;
  const users = Array.from(form.querySelectorAll('input')).filter(input => visible(input) && ['text', 'email', 'tel'].includes(input.type));
  const username = users.find(input => input.autocomplete === 'username') || users.find(input => input.type === 'email') || (users.length === 1 ? users[0] : null);
  if (!username) return false;
  // Background filling must never overwrite the user's current credentials.
  if (login.automatic && (password.value || (username.value && username.value !== login.username))) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;
  for (const [field, value] of [[username, login.username], [password, login.password]]) {
    setter.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return true; // Never submit the form on the user's behalf.
})();
