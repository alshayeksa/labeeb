import { describe, it, expect } from "vitest";
import { completeAddress, nextZoom, normalizeAddress, safeFrame, historyDate, utf8Length } from "./bridge";
import { dictionaries, approvalSummaryKeys } from "./i18n";
describe("address boundary", () => {
  it("normalizes websites and search", () => {
    expect(normalizeAddress("example.com")).toBe("https://example.com/");
    expect(normalizeAddress("  https://example.com/a  ")).toBe(
      "https://example.com/a",
    );
    expect(normalizeAddress("أفضل متصفح")).toBe(
      "https://www.google.com/search?q=%D8%A3%D9%81%D8%B6%D9%84%20%D9%85%D8%AA%D8%B5%D9%81%D8%AD",
    );
    expect(normalizeAddress("")).toBe("");
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///etc/passwd",
    "tauri://localhost",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (value) =>
    expect(() => normalizeAddress(value)).toThrow(),
  );
});
describe("untrusted image boundary", () => {
  it("allows raster base64 but rejects markup, SVG and remote URLs", () => {
    expect(safeFrame("YWJj")).toBe("data:image/jpeg;base64,YWJj");
    expect(safeFrame("data:image/png;base64,YWJj")).toBe(
      "data:image/png;base64,YWJj",
    );
    expect(safeFrame("data:image/svg+xml;base64,YWJj")).toBeNull();
    expect(safeFrame("https://tracker.test/a.png")).toBeNull();
    expect(safeFrame("<svg/onload=alert(1)>")).toBeNull();
    expect(safeFrame()).toBeNull();
  });
});
describe("localization", () => {
  it("has complete dictionary parity", () => {
    expect(Object.keys(dictionaries.ar).sort()).toEqual(
      Object.keys(dictionaries.en).sort(),
    );
    for (const locale of Object.values(dictionaries))
      for (const text of Object.values(locale))
        expect(text.trim()).not.toBe("");
    expect(approvalSummaryKeys["Remove this bookmark"]).toBe(
      "approveBookmarkRemove",
    );
  });
  it("converts SQLite seconds rather than milliseconds", () => {
    expect(historyDate(1794528000, "en-US")).toBe(
      new Date(1794528000000).toLocaleDateString("en-US"),
    );
  });
});

it("counts UTF-8 bytes for the native prompt limit", () => {
  expect(utf8Length("مرحبا")).toBe(10);
  expect(utf8Length("x".repeat(16000))).toBe(16000);
});

describe("address completion and zoom", () => {
  it("completes only bare website names", () => {
    expect(normalizeAddress(completeAddress(" alshaye "))).toBe("https://www.alshaye.com/");
    for (const value of ["https://alshaye.ai/a", "alshaye.ai", "two words", "localhost", "", "javascript:alert(1)"])
      expect(completeAddress(value)).toBe(value);
  });
  it("steps from arbitrary wheel zoom and clamps the supported range", () => {
    expect(nextZoom(1.17, 1)).toBe(1.25);
    expect(nextZoom(1.17, -1)).toBe(1.1);
    expect(nextZoom(5, 1)).toBe(5);
    expect(nextZoom(.25, -1)).toBe(.25);
  });
});
