import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTheme } from "./theme";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });
it("follows system changes only while System is selected and removes the listener", () => {
  localStorage.clear();
  let notify = () => {};
  const media = { matches:false, addEventListener:vi.fn((_event, fn) => {notify=fn;}), removeEventListener:vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  const {result, unmount} = renderHook(useTheme);
  expect(result.current.resolved).toBe("light");
  act(() => {media.matches=true; notify();});
  expect(result.current.resolved).toBe("dark");
  act(() => result.current.change("light"));
  act(() => notify());
  expect(result.current.resolved).toBe("light");
  act(() => result.current.change("system"));
  expect(result.current.resolved).toBe("dark");
  unmount();
  expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
});
it("allows switching when preference storage is unavailable", () => {
  vi.spyOn(Storage.prototype,"getItem").mockImplementation(() => {throw new Error("unavailable");});
  vi.spyOn(Storage.prototype,"setItem").mockImplementation(() => {throw new Error("unavailable");});
  const {result} = renderHook(useTheme);
  act(() => result.current.change("dark"));
  expect(result.current.resolved).toBe("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
});
