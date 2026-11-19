import type { Snapshot } from "./bridge";
// Preserve unchanged branch identities so background download updates do not
// invalidate tabs or the address index. Never mutate the native payload.
function sameRecord(a: object, b: object): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as (keyof typeof a)[]);
  return [...keys].every(key => Object.is(a[key], b[key]));
}
function shareRows<T extends object>(previous: T[], next: T[]): T[] {
  if (previous === next) return previous;
  const rows = next.map((row,index)=>previous[index] && sameRecord(previous[index],row) ? previous[index] : row);
  return previous.length === rows.length && rows.every((row,index)=>row === previous[index]) ? previous : rows;
}
export function reconcileSnapshot(previous: Snapshot, incoming: Snapshot): Snapshot {
  const settings = {...incoming.settings};
  if (previous.settings.aiConnection && settings.aiConnection && sameRecord(previous.settings.aiConnection, settings.aiConnection)) settings.aiConnection = previous.settings.aiConnection;
  const next: Snapshot = {...incoming,
    tabs:shareRows(previous.tabs,incoming.tabs),
    downloads:shareRows(previous.downloads,incoming.downloads),
    history:incoming.history ? shareRows(previous.history,incoming.history) : previous.history,
    bookmarks:incoming.bookmarks ? shareRows(previous.bookmarks,incoming.bookmarks) : previous.bookmarks,
    settings:sameRecord(previous.settings,settings) ? previous.settings : settings,
    video:JSON.stringify(previous.video) === JSON.stringify(incoming.video) ? previous.video : incoming.video,
  };
  return sameRecord(previous,next) ? previous : next;
}
