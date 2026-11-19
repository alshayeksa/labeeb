import type { SavedPage } from "./bridge";

export function normalizeSearch(text: string) {
  return text.normalize("NFKD").toLowerCase().replace(/\p{M}|ـ/gu, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit >= "۰" ? 0x6f0 : 0x660)));
}

export function searchLibrary(pages: SavedPage[], query: string, locale: string) {
  const terms = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return pages;
  return pages.filter(page => {
    let decoded = page.url;
    try { decoded = decodeURIComponent(page.url); } catch { /* Keep malformed URLs searchable. */ }
    const date = page.visitedAt == null ? null : new Date(typeof page.visitedAt === "number" ? page.visitedAt * 1000 : page.visitedAt);
    const dates = date && !Number.isNaN(date.getTime()) ? [
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      ...[locale, "en", "ar"].flatMap(lang => [date.toLocaleDateString(lang), date.toLocaleDateString(lang, { year: "numeric", month: "long", day: "numeric" })]),
    ].join(" ") : "";
    const text = normalizeSearch(`${page.title} ${page.url} ${decoded} ${dates}`);
    return terms.every(term => text.includes(term));
  });
}
