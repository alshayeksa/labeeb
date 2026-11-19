import { describe, expect, it } from "vitest";
import { searchLibrary } from "./librarySearch";
const pages = [
  { id: 1, title: "أخبار التِقنية", url: "https://example.com/%D8%B9%D9%84%D9%88%D9%85", visitedAt: "2026-11-15T12:00:00" },
  { id: 2, title: "Design Guide", url: "https://design.test/guide", visitedAt: "2025-01-02T12:00:00" },
];
describe("saved library search", () => {
  it("matches Arabic variants, decoded paths and terms across fields", () => {
    expect(searchLibrary(pages, "اخبار التقنية علوم EXAMPLE", "ar")).toEqual([pages[0]]);
  });
  it("matches local dates with Arabic digits and month names", () => {
    expect(searchLibrary(pages, "٢٠٢٦-١١-١٥", "ar")).toEqual([pages[0]]);
    expect(searchLibrary(pages, "November 2026", "en")).toEqual([pages[0]]);
  });
  it("returns all entries for empty search and none for unmatched terms", () => {
    expect(searchLibrary(pages, "  ", "en")).toBe(pages);
    expect(searchLibrary(pages, "missing", "en")).toEqual([]);
    expect(searchLibrary(pages, "design example", "en")).toEqual([]);
  });
  it("handles malformed URLs and dates", () => {
    expect(searchLibrary([{ id: 3, title: "saved", url: "https://site/%zz", visitedAt: "bad" }], "%zz", "en")).toHaveLength(1);
  });
});
