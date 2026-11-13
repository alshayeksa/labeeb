import { describe, expect, it } from "vitest";
import { addressSuggestions } from "./addressSuggestions";
const page = (url:string, title = "Page", id = 1) => ({id,url,title});
describe("local address suggestions", () => {
  it("deduplicates visits and ranks hostname prefixes before title matches", () => {
    const rows = addressSuggestions("reef", [page("https://other.test/", "Reefi article"), page("https://reefi.me/"), page("https://reefi.me/")], [page("https://reefi.me/")]);
    expect(rows.map(x=>x.url)).toEqual(["https://reefi.me/", "https://other.test/"]);
    expect(rows[0].bookmarked).toBe(true);
  });
  it("matches Arabic titles and limits recent suggestions", () => {
    expect(addressSuggestions("ريفي", [page("https://reefi.me/", "متجر ريفي")], [])).toHaveLength(1);
    expect(addressSuggestions("", Array.from({length:10}, (_,i)=>page(`https://example.com/${i}`)), [])).toHaveLength(6);
    expect(addressSuggestions("missing", [page("https://reefi.me/")], [])).toEqual([]);
  });
  it("rejects malformed, privileged and credential-bearing URLs", () => {
    expect(addressSuggestions("", ["bad", "javascript:alert(1)", "tauri://localhost", "file:///test", "https://user:secret@example.com"].map(url=>page(url)), [])).toEqual([]);
  });
});
