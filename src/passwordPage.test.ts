import capture from "../src-tauri/src/password-page.js?raw";
import fillScript from "../src-tauri/src/password-fill.js?raw";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const location = { href: "https://example.com/login", origin: "https://example.com", protocol: "https:" };
beforeEach(() => {
  document.body.innerHTML = '<form action="https://example.com/login"><input autocomplete="username" value="person"><input type="password" value="synthetic-secret"></form>';
  vi.spyOn(HTMLInputElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });
function harness(loc = location, frame = false, tracing = false) {
  const postMessage = vi.fn();
  const transport = vi.fn((payload: string) => {
    expect(typeof payload).toBe("string");
    postMessage(JSON.parse(payload));
  });
  let config!: (e: { data: unknown }) => void;
  const bridge = { postMessage: transport, addEventListener: (_: string, listener: typeof config) => { config = listener; } };
  const windowEvents = new Map<string, () => void>();
  const win: Record<string, unknown> = { chrome: { webview: bridge }, addEventListener: (name: string, fn: () => void) => windowEvents.set(name, fn) }; win.top = frame ? {} : win;
  const events = vi.spyOn(document, "addEventListener");
  const script = tracing ? capture.replace("const traceEnabled = false;", "const traceEnabled = true;") : capture;
  new Function("window", "document", "location", "HTMLFormElement", script)(win, document, loc, HTMLFormElement);
  const handler = events.mock.calls.find(([name]) => name === "submit")?.[1] as (e: unknown) => void;
  const dispatch = (name: string, event: unknown) => (events.mock.calls.find(([type]) => type === name)?.[1] as (event: unknown) => void)?.(event);
  return { postMessage, dispatch, windowEvents, configure: (enabled: boolean) => config({ data: { kind: "labeeb-password-config", enabled } }), submit: (isTrusted = true) => handler?.({ isTrusted, target: document.querySelector("form") }) };
}
it("diagnostic messages contain only fixed status codes and no credential contents", () => {
  const h = harness(location, false, true); h.configure(true); h.submit();
  const traces = h.postMessage.mock.calls.map(([packet]) => packet).filter(packet => packet.kind === "labeeb-password-trace");
  expect(traces).toEqual([
    { kind: "labeeb-password-trace", code: "script_ready" },
    { kind: "labeeb-password-trace", code: "config_on" },
    { kind: "labeeb-password-trace", code: "submit" },
    { kind: "labeeb-password-trace", code: "proposal_sent" },
  ]);
});
it("retries readiness after document creation and BFCache restore without capturing credentials", () => {
  const h = harness(); h.dispatch("DOMContentLoaded", {}); h.windowEvents.get("pageshow")?.();
  expect(h.postMessage.mock.calls).toEqual(Array(3).fill([{ kind: "labeeb-password-ready" }]));
  h.configure(true); h.submit(); expect(h.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "labeeb-password-save" }));
});
it("captures a trusted submit-button click before JS removes the form, without duplicate offers", () => {
  const form = document.querySelector("form")!;
  form.insertAdjacentHTML("beforeend", '<button><span>Sign in</span></button>');
  const h = harness(); h.configure(true);
  h.dispatch("click", { isTrusted: true, target: form.querySelector("span") });
  h.submit();
  expect(h.postMessage).toHaveBeenCalledTimes(2);
  expect(h.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "labeeb-password-save" }));
});
it.each(["disabled", "untrusted", "cross-origin", "non-submit", "invalid"])("does not capture a %s button activation", kind => {
  const form = document.querySelector("form")!;
  form.insertAdjacentHTML("beforeend", '<button>Sign in</button>');
  const button = form.querySelector("button")!;
  if (kind === "disabled") button.disabled = true;
  if (kind === "cross-origin") button.setAttribute("formaction", "https://other.example/login");
  if (kind === "non-submit") button.type = "button";
  if (kind === "invalid") { const input = form.querySelector("input")!; input.required = true; input.value = ""; }
  const h = harness(); h.configure(true); h.dispatch("click", { isTrusted: kind !== "untrusted", target: button });
  expect(h.postMessage).toHaveBeenCalledTimes(1);
});
it("captures Enter in login fields but not composing or modified keys", () => {
  const h = harness(); h.configure(true);
  const event = { isTrusted: true, key: "Enter", target: document.querySelector('input[type="password"]') };
  h.dispatch("keydown", { ...event, isComposing: true }); h.dispatch("keydown", { ...event, shiftKey: true });
  expect(h.postMessage).toHaveBeenCalledTimes(1);
  h.dispatch("keydown", event); expect(h.postMessage).toHaveBeenCalledTimes(2);
});
it("captures only a trusted submitted login when saving is enabled and stops immediately when disabled", () => {
  const h = harness(); h.submit();
  expect(h.postMessage).toHaveBeenCalledTimes(1); // readiness only, no secrets
  h.configure(true); h.submit(false); expect(h.postMessage).toHaveBeenCalledTimes(1);
  h.submit(); expect(h.postMessage).toHaveBeenLastCalledWith({ kind: "labeeb-password-save", username: "person", password: "synthetic-secret" });
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20000);
  h.configure(false); h.submit(); expect(h.postMessage).toHaveBeenCalledTimes(2);
});
it.each(["http", "frame"])("does not capture in %s contexts", kind => {
  const h = harness(kind === "http" ? { ...location, protocol: "http:" } : location, kind === "frame");
  expect(h.postMessage).not.toHaveBeenCalled();
});
it.each(["cross-origin", "new-password", "multiple", "empty", "hidden"])("rejects %s login forms", kind => {
  const form = document.querySelector("form")!;
  const password = form.querySelector<HTMLInputElement>('[type="password"]')!;
  if (kind === "cross-origin") form.action = "https://other.example/login";
  if (kind === "new-password") password.autocomplete = "new-password";
  if (kind === "multiple") form.appendChild(password.cloneNode());
  if (kind === "empty") password.value = "";
  if (kind === "hidden") vi.mocked(HTMLInputElement.prototype.getClientRects).mockReturnValue([] as unknown as DOMRectList);
  const h = harness(); h.configure(true); h.submit(); expect(h.postMessage).toHaveBeenCalledTimes(1);
});
function fill(url = location.href, automatic = false) {
  const win: Record<string, unknown> = {}; win.top = win;
  const script = fillScript.replace("/*LOGIN_DATA*/", JSON.stringify({ url, username: "saved-user", password: "saved-secret", automatic }));
  return new Function("window", "document", "location", "HTMLInputElement", "Event", `return ${script}`)(win, document, location, HTMLInputElement, Event);
}
it("automatically fills empty fields but preserves credentials already entered by the user", () => {
  const username = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
  const password = document.querySelector<HTMLInputElement>('input[type="password"]')!;
  expect(fill(location.href, true)).toBe(false);
  expect(password.value).toBe("synthetic-secret");
  password.value = "";
  expect(fill(location.href, true)).toBe(false);
  expect(username.value).toBe("person");
  username.value = "";
  expect(fill(location.href, true)).toBe(true);
  expect(password.value).toBe("saved-secret");
});
it("fills a matching site without submitting and dispatches input events", () => {
  const submit = vi.fn(), input = vi.fn(); document.querySelector("form")!.addEventListener("submit", submit);
  document.querySelector('input[type="password"]')!.addEventListener("input", input);
  expect(fill()).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("saved-secret");
  expect(input).toHaveBeenCalledOnce(); expect(submit).not.toHaveBeenCalled();
});
it("refuses filling after navigation or into a cross-origin form", () => {
  expect(fill("https://other.example/login")).toBe(false);
  document.querySelector("form")!.action = "https://other.example/login";
  expect(fill()).toBe(false);
  expect(document.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("synthetic-secret");
});
