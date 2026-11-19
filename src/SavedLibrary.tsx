import { useMemo, useState } from "react";
import type { BrowserModel } from "./useBrowser";
import { historyDate } from "./bridge";
import { searchLibrary } from "./librarySearch";
import { Clock3, Star, Search, X } from "./icons";
import { EmptyState, IconButton, PageMark } from "./components";

export default function SavedLibrary({ model: m, history }: { model: BrowserModel; history: boolean }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const ar = m.locale === "ar";
  const pages = history ? m.snapshot.history : m.snapshot.bookmarks;
  const results = useMemo(() => searchLibrary(pages, query, m.locale), [pages, query, m.locale]);
  const label = ar ? (history ? "البحث في سجل التصفح" : "البحث في المفضلة") : (history ? "Search browsing history" : "Search bookmarks");
  return <>
    <div className="library-search" role="search" aria-label={label}>
      <div className="library-search-field">
        <Search size={19} aria-hidden="true" />
        <input type="search" aria-label={label} placeholder={ar ? "ابحث بالعنوان، الرابط، الموقع أو التاريخ…" : "Search title, URL, website or date…"}
          value={query} onChange={event => { setQuery(event.target.value); setLimit(50); }}
          onKeyDown={event => { if (event.key === "Escape") { setQuery(""); setLimit(50); } }} />
        {query && <IconButton label={ar ? "مسح البحث" : "Clear search"} onClick={() => { setQuery(""); setLimit(50); }}><X size={17} /></IconButton>}
      </div>
      <p role="status">{ar ? `${results.length.toLocaleString("ar")} من ${pages.length.toLocaleString("ar")} صفحة` : `${results.length.toLocaleString()} of ${pages.length.toLocaleString()} pages`}</p>
    </div>
    {!pages.length ? <EmptyState icon={history ? Clock3 : Star} title={m.t(history ? "noHistory" : "noBookmarks")} detail={m.t(history ? "noHistoryDetail" : "noBookmarksDetail")} />
      : !results.length ? <EmptyState icon={Search} title={ar ? "لا توجد نتائج مطابقة" : "No matching results"} detail={ar ? "جرّب كلمات أخرى أو جزءًا من الرابط أو التاريخ." : "Try other words, part of a URL or a date."} />
      : <div className="saved-list">
        {results.slice(0, limit).map(page => <article className="saved-row" key={page.id}>
          <PageMark url={page.url} />
          <button className="page-link" onClick={async () => { if (await m.run("tab_create", { url: page.url })) m.setSection("browser"); }}>
            <strong>{page.title || m.t("pageTitle")}</strong><span dir="ltr">{page.url}</span>
          </button>
          {page.visitedAt && <time>{historyDate(page.visitedAt, m.locale)}</time>}
          {!history && <IconButton label={m.t("remove")} disabled={m.busy} onClick={() => void m.run("bookmark_remove", { id: page.id })}><X size={16} /></IconButton>}
        </article>)}
        {results.length > limit && <button className="button" onClick={() => setLimit(value => value + 50)}>{ar ? "عرض المزيد" : "Show more"}</button>}
      </div>}
  </>;
}
