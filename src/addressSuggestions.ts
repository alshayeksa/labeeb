import type { SavedPage } from "./bridge";
export interface AddressSuggestion { url: string; title: string; bookmarked: boolean }
interface IndexedPage { suggestion: AddressSuggestion; hostname: string; address: string; title: string }
// Snapshots are immutable. Weak keys release the index when its library is replaced.
const indexes = new WeakMap<SavedPage[], WeakMap<SavedPage[], IndexedPage[]>>();
function indexPages(history: SavedPage[], bookmarks: SavedPage[]): IndexedPage[] {
  let byBookmarks = indexes.get(history);
  const cached = byBookmarks?.get(bookmarks);
  if (cached) return cached;
  const bookmarkedUrls = new Set(bookmarks.map(page => page.url));
  const rows: IndexedPage[] = [];
  for (const source of [history, bookmarks]) for (const page of source) {
    let url: URL;
    try { url = new URL(page.url); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    rows.push({suggestion:{url:url.href,title:page.title || url.hostname,bookmarked:bookmarkedUrls.has(page.url)},
      hostname:url.hostname.replace(/^www\./, "").toLocaleLowerCase(),address:url.href.toLocaleLowerCase(),title:page.title.toLocaleLowerCase()});
  }
  if (!byBookmarks) { byBookmarks = new WeakMap(); indexes.set(history, byBookmarks); }
  byBookmarks.set(bookmarks, rows);
  return rows;
}
// Local only: never sends typed text to a search provider. Keep six entries per
// rank instead of sorting the entire match set; ties retain original visit order.
export function addressSuggestions(query: string, history: SavedPage[], bookmarks: SavedPage[]): AddressSuggestion[] {
  const needle = query.trim().toLocaleLowerCase(), rows = indexPages(history, bookmarks);
  const seen = new Set<string>();
  if (!needle) {
    const recent: AddressSuggestion[] = [];
    for (const row of rows) {
      if (seen.has(row.suggestion.url)) continue;
      seen.add(row.suggestion.url); recent.push(row.suggestion);
      if (recent.length === 6) break;
    }
    return recent;
  }
  const buckets: AddressSuggestion[][] = [[],[],[],[],[]];
  for (const row of rows) {
    if (!row.address.includes(needle) && !row.title.includes(needle)) continue;
    // Deduplicate after matching: older visits may have a different title.
    if (seen.has(row.suggestion.url)) continue;
    seen.add(row.suggestion.url);
    const score = row.hostname.startsWith(needle) ? 4 : row.address.startsWith(needle) ? 3 : row.title.startsWith(needle) ? 2 : 1;
    if (buckets[score].length < 6) buckets[score].push(row.suggestion);
  }
  return [...buckets[4],...buckets[3],...buckets[2],...buckets[1]].slice(0,6);
}
