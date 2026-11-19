import script from "../src-tauri/src/password-discovery.js?raw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const location = { href: "https://example.com/login", origin: "https://example.com", protocol: "https:" };
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<form action="https://example.com/login"><input type="email"><input type="password"></form>';
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLInputElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); document.body.innerHTML = ""; });
function start(loc = location, frame = false) {
  const post = vi.fn(); let mutate!: () => void;
  const win: Record<string, unknown> = { chrome: { webview: { postMessage: post, addEventListener: vi.fn() } }, addEventListener: vi.fn() };
  win.top = frame ? {} : win;
  class Observer { constructor(callback: () => void) { mutate = callback; } observe() {} }
  new Function("window", "document", "location", "MutationObserver", script)(win, document, loc, Observer);
  vi.advanceTimersByTime(250);
  return { post, mutate: () => { mutate(); vi.advanceTimersByTime(250); } };
}
it("announces a login form without accessing or transmitting field values", () => {
  vi.spyOn(HTMLInputElement.prototype, "value", "get").mockImplementation(() => { throw new Error("must not read credentials"); });
  const h = start();
  expect(h.post).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ kind: "labeeb-password-form" }));
  h.mutate(); expect(h.post).toHaveBeenCalledTimes(1);
});
it("detects a login form inserted after client-side navigation", () => {
  document.body.innerHTML = "";
  const h = start(); expect(h.post).not.toHaveBeenCalled();
  document.body.innerHTML = '<form action="https://example.com/login"><input type="password"></form>';
  h.mutate(); expect(h.post).toHaveBeenCalledTimes(1);
});
it.each(["http", "iframe", "hidden", "disabled", "readonly", "new-password", "cross-origin", "ambiguous"])("does not announce %s forms", kind => {
  const password = document.querySelector<HTMLInputElement>('[type="password"]')!;
  if (kind === "hidden") vi.mocked(HTMLInputElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);
  if (kind === "disabled") password.disabled = true;
  if (kind === "readonly") password.readOnly = true;
  if (kind === "new-password") password.autocomplete = "new-password";
  if (kind === "cross-origin") password.form!.action = "https://other.example/login";
  if (kind === "ambiguous") password.form!.append(password.cloneNode());
  const h = start(kind === "http" ? { ...location, protocol: "http:" } : location, kind === "iframe");
  expect(h.post).not.toHaveBeenCalled();
});
