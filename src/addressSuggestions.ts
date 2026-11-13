import type { SavedPage } from "./bridge";

export interface AddressSuggestion { url: string; title: string; bookmarked: boolean }

// Use existing local snapshots; typing never sends a request to a search provider.
export function addressSuggestions(query: string, history: SavedPage[], bookmarks: SavedPage[]): AddressSuggestion[] {
  const needle = query.trim().toLocaleLowerCase();
  const pages = new Map<string, AddressSuggestion & { score: number; order: number }>();
  const bookmarkedUrls = new Set(bookmarks.map(page => page.url));
  for (const [order, page] of [...history, ...bookmarks].entries()) {
    let url: URL;
    try { url = new URL(page.url); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    const hostname = url.hostname.replace(/^www\./, "").toLocaleLowerCase();
    const title = page.title.toLocaleLowerCase();
    const address = url.href.toLocaleLowerCase();
    if (needle && !address.includes(needle) && !title.includes(needle)) continue;
    const bookmarked = bookmarkedUrls.has(page.url);
    const score = !needle ? 0 : hostname.startsWith(needle) ? 4 : address.startsWith(needle) ? 3 : title.startsWith(needle) ? 2 : 1;
    const previous = pages.get(url.href);
    if (!previous) pages.set(url.href, { url: url.href, title: page.title || url.hostname, bookmarked, score, order });
  }
  return [...pages.values()].sort((a,b) => b.score - a.score || a.order - b.order).slice(0,6)
    .map(({url,title,bookmarked}) => ({url,title,bookmarked}));
}
