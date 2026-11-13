import labeebLogo from "./assets/labeeb-logo.png";
import VideoDownloads, { isYouTubeVideo } from "./VideoDownloads";
import VideoOffer from "./VideoOffer";
import type { VideoOfferData } from "./VideoOffer";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Minus,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TerminalSquare,
  Trash2,
  X,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { completeAddress, nextZoom, command, historyDate } from "./bridge";
import {
  approvalKindKeys,
  approvalSummaryKeys,
  approvalPayloadKeys,
} from "./i18n";
import type { TranslationKey } from "./i18n";
import { useBrowser } from "./useBrowser";
import Sidebar, { readSidebarMode, saveSidebarMode } from "./Sidebar";
import type { SidebarMode } from "./Sidebar";
import { addressSuggestions } from "./addressSuggestions";
import { EmptyState, IconButton, PageMark } from "./components";
import AssistantPanel from "./AssistantPanel";
import AutomationPanel from "./AutomationPanel";
import SettingsPanel from "./SettingsPanel";
import DiagnosticsPanel from "./DiagnosticsPanel";
import AboutPanel from "./AboutPanel";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme";
export default function App() {
  const theme = useTheme();
  const [videoUrl, setVideoUrl] = useState("");
  const [videoOffer, setVideoOffer] = useState<VideoOfferData | null>(null);
  const lastVideoOffer = useRef(0);
  useEffect(() => {
    let disposed = false; let stop: (()=>void) | undefined;
    void listen<VideoOfferData>("video-offer", event => {
      const offer = event.payload;
      if (Date.now() - lastVideoOffer.current < 1500) return;
      try { const url = new URL(offer.url); if (url.protocol !== "https:" || !["youtube", "direct"].includes(offer.kind)) return; } catch { return; }
      lastVideoOffer.current = Date.now(); setVideoOffer(current => current ?? offer);
    }).then(fn=>{if(disposed) fn(); else stop=fn;}).catch(()=>{});
    return ()=>{disposed=true;stop?.();};
  }, []);
  const m = useBrowser(),
    { t, snapshot, activeTab } = m;
  const [assistantOpen, setAssistantOpen] = useState(false),
    [address, setAddress] = useState(""),
    [homeAddress, setHomeAddress] = useState(""),
    [confirmHistory, setConfirmHistory] = useState(false),
    [shortcutsOpen, setShortcutsOpen] = useState(false),
    [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode),
    [suggestionsOpen, setSuggestionsOpen] = useState(false),
    [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => addressSuggestions(address, snapshot.history, snapshot.bookmarks), [address, snapshot.history, snapshot.bookmarks]);
  const showSuggestions = suggestionsOpen && suggestions.length > 0;
  const changeSidebarMode = (mode: SidebarMode) => { setSidebarMode(mode); saveSidebarMode(mode); };
  const navigateAddress = (value: string) => { setSuggestionsOpen(false); setSelectedSuggestion(-1); void m.navigate(value); };
  const addressRef = useRef<HTMLInputElement>(null),
    browserRef = useRef<HTMLDivElement>(null),
    modalRef = useRef<HTMLElement>(null),
    lastAddressContext = useRef({ id: null as string | null, url: "" });
  const emptyBrowser = !activeTab || activeTab.url === "about:blank";
  const connectionKind = activeTab?.url.startsWith("https://")
    ? "httpsConnection"
    : activeTab?.url.startsWith("http://")
      ? "httpConnection"
      : "noConnection";
  const tabTitle = (title: string) =>
    !title || title === "New tab" ? t("newTabLabel") : title;
  useEffect(() => {
    document.title = `${t("brand")} · ${activeTab?.title || t("newTab")}`;
  }, [t, activeTab?.title]);
  useEffect(() => {
    const url = activeTab?.url || "";
    if (
      lastAddressContext.current.url !== url ||
      lastAddressContext.current.id !== snapshot.activeTabId
    ) {
      lastAddressContext.current = { id: snapshot.activeTabId, url };
      setAddress(url === "about:blank" ? "" : url);
      setSuggestionsOpen(false);
      setSelectedSuggestion(-1);
    }
  }, [activeTab?.url, snapshot.activeTabId]);
  useEffect(() => {
    if (selectedSuggestion >= suggestions.length) setSelectedSuggestion(-1);
  }, [suggestions.length, selectedSuggestion]);
  useEffect(() => {
    if (selectedSuggestion >= 0) document.getElementById(`address-option-${selectedSuggestion}`)?.scrollIntoView?.({block:"nearest"});
  }, [selectedSuggestion]);
  const focusAddress = () => { addressRef.current?.focus(); addressRef.current?.select(); };
  const newTab = async () => { await m.createTab(); focusAddress(); };
  const zoom = (direction: number) => {
    if (activeTab) void m.run("tab_zoom", { id: activeTab.id,
      scale: direction === 0 ? 1 : nextZoom(activeTab.zoom ?? 1, direction) });
  };
  const handleKey = (key: string, ctrl: boolean, shift: boolean, alt: boolean) => {
    key = key.toLowerCase();
    if ((ctrl && !alt && key === "l") || (alt && key === "d") || key === "f6") { focusAddress(); return true; }
    if (ctrl && !alt) {
      if (key === "t") { if (shift) { m.setSection("browser"); void m.run("tab_reopen"); } else void newTab(); return true; }
      if (key === "w") { if (activeTab) void m.run("tab_close", { id: activeTab.id }); return true; }
      if (key === "tab" || /^[1-9]$/.test(key)) {
        const tabs = snapshot.tabs;
        const index = key === "tab" ? (tabs.findIndex(t => t.id === activeTab?.id) + (shift ? -1 : 1) + tabs.length) % tabs.length
          : key === "9" ? tabs.length - 1 : Number(key) - 1;
        if (tabs[index]) { m.setSection("browser"); void m.run("tab_select", { id: tabs[index].id }); }
        return true;
      }
      if (key === "h" || key === "j") { m.setSection(key === "h" ? "history" : "downloads"); return true; }
      if (key === "f") { if (activeTab && !emptyBrowser) { m.setSection("browser"); void m.run("tab_find", {id:activeTab.id}); } return true; }
      if (key === "d") { if (activeTab && !emptyBrowser) void m.run("bookmark_add", { url: activeTab.url, title: activeTab.title }); return true; }
      if (["+", "=", "-", "0"].includes(key)) { zoom(key === "0" ? 0 : key === "-" ? -1 : 1); return true; }
    }
    const action = (ctrl && key === "r") || key === "f5" ? "reload"
      : alt && key === "arrowleft" ? "back" : alt && key === "arrowright" ? "forward" : null;
    if (action) { if (activeTab) void m.run("tab_action", { id: activeTab.id, action }); return true; }
    return false;
  };
  const keyHandler = useRef(handleKey);
  keyHandler.current = handleKey;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      if (keyHandler.current(event.key, event.ctrlKey || event.metaKey, event.shiftKey, event.altKey)) event.preventDefault();
    };
    document.addEventListener("keydown", handler);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (m.isNative) void listen<{code: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean}>("browser-key", ({payload: e}) => {
      const key = ({9:"Tab",37:"ArrowLeft",39:"ArrowRight",116:"F5",117:"F6"} as Record<number,string>)[e.code] ?? String.fromCharCode(e.code);
      keyHandler.current(key, e.ctrlKey, e.shiftKey, e.altKey);
    }).then(fn => { if (disposed) fn(); else unlisten = fn; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); document.removeEventListener("keydown", handler); };
  }, [m.isNative]);
  // A native child WebView paints above the shell. Hide it for non-browser pages and overlays.
  useEffect(() => {
    if (!m.isNative) return;
    const update = () => {
      const rect = browserRef.current?.getBoundingClientRect();
      // Child WebView2 surfaces paint above HTML. Reserve the suggestion panel's
      // overlap so it stays clickable while the rest of the website remains visible.
      const panelBottom = showSuggestions ? suggestionRef.current?.getBoundingClientRect().bottom ?? 0 : 0;
      const offset = rect ? Math.min(Math.max(0, panelBottom + (panelBottom ? 8 : 0) - rect.y), Math.max(0, rect.height - 1)) : 0;
      const visible =
        m.section === "browser" &&
        !confirmHistory &&
        !shortcutsOpen &&
        !videoOffer &&
        !m.toast &&
        !emptyBrowser &&
        !!rect;
      void command("browser_bounds", {
        x: rect?.x ?? 0,
        y: (rect?.y ?? 0) + offset,
        width: Math.max(1, rect?.width ?? 1),
        height: Math.max(1, (rect?.height ?? 1) - offset),
        visible,
      }).catch(() => {});
    };
    update();
    const observer = new ResizeObserver(update);
    if (browserRef.current) observer.observe(browserRef.current);
    if (suggestionRef.current) observer.observe(suggestionRef.current);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [
    m.isNative,
    m.section,
    m.toast,
    assistantOpen,
    confirmHistory,
    shortcutsOpen,
    videoOffer,
    emptyBrowser,
    activeTab?.id,
    showSuggestions,
    suggestions.length,
    sidebarMode,
  ]);
  useEffect(() => {
    if (!confirmHistory && !shortcutsOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setConfirmHistory(false);
        setShortcutsOpen(false);
      }
      if (event.key === "Tab") {
        const buttons =
          modalRef.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [confirmHistory, shortcutsOpen]);
  const nav = (action: string) => {
    if (activeTab) void m.run("tab_action", { id: activeTab.id, action });
  };
  return (
    <div className="app-shell" dir={m.locale === "ar" ? "rtl" : "ltr"}>
      <header className="titlebar">
        <div className="brand">
          <span className="brand-symbol">
            <img src={labeebLogo} alt="" width={30} height={30} />
          </span>
          <strong>{t("brand")}</strong>
          <span className="brand-dot" />
        </div>
        <div className="tab-strip" role="tablist" aria-label={t("tabs")}>
          {snapshot.tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.id === snapshot.activeTabId ? "active" : ""}`}
              onAuxClick={(event) => { if (event.button === 1) { event.preventDefault(); void m.run("tab_close", { id: tab.id }); } }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === snapshot.activeTabId}
                title={tab.deferred && tab.url !== "about:blank" ? (m.locale === "ar" ? "سيُحمّل عند فتحه لتوفير الذاكرة" : "Loads when selected to save memory") : tab.title}
                onClick={() => {
                  m.setSection("browser");
                  void m.run("tab_select", { id: tab.id });
                }}
              >
                <Globe2 size={14} />
                <span>{tabTitle(tab.title)}</span>
                {tab.loading && <LoaderCircle size={13} className="spin" />}
              </button>
              <button
                className="tab-close"
                title={t("closeTab")}
                aria-label={`${t("closeTab")}: ${tabTitle(tab.title)}`}
                onClick={() => void m.run("tab_close", { id: tab.id })}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {!snapshot.tabs.length && (
            <span className="preview-tab">
              <Globe2 size={14} />
              {t("newTabLabel")}
            </span>
          )}
          <IconButton label={t("newTab")} onClick={() => void newTab()}>
            <Plus size={17} />
          </IconButton>
        </div>
        <span className="private-pill">
          <ShieldCheck size={13} />
          {t("local")}
        </span>
      </header>
      <div className="toolbar">
        <div className="navigation-buttons">
          <IconButton
            label={t("back")}
            disabled={!activeTab || m.busy}
            onClick={() => nav("back")}
          >
            <ArrowRight size={18} className="rtl-icon" />
          </IconButton>
          <IconButton
            label={t("forward")}
            disabled={!activeTab || m.busy}
            onClick={() => nav("forward")}
          >
            <ArrowLeft size={18} className="rtl-icon" />
          </IconButton>
          <IconButton
            label={t(activeTab?.loading ? "stop" : "reload")}
            disabled={!activeTab || m.busy}
            onClick={() => nav(activeTab?.loading ? "stop" : "reload")}
          >
            {activeTab?.loading ? <X size={17} /> : <RefreshCw size={16} />}
          </IconButton>
        </div>
        <form
          className="address-bar"
          onSubmit={(event) => {
            event.preventDefault();
            navigateAddress(selectedSuggestion >= 0 && showSuggestions ? suggestions[selectedSuggestion].url : address);
          }}
        >
          <span role="img" aria-label={t(connectionKind)} title={t(connectionKind)}>
            {connectionKind === "httpsConnection" ? (
              <LockKeyhole size={15} aria-hidden="true" />
            ) : (
              <Globe2 size={15} aria-hidden="true" />
            )}
          </span>
          <input
            ref={addressRef}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault(); navigateAddress(completeAddress(address));
              } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
                event.preventDefault(); setSuggestionsOpen(true);
                setSelectedSuggestion(index => event.key === "ArrowDown" ? (index + 1) % suggestions.length : (index <= 0 ? suggestions.length - 1 : index - 1));
              } else if (event.key === "Enter" && showSuggestions && selectedSuggestion >= 0) {
                event.preventDefault(); navigateAddress(suggestions[selectedSuggestion].url);
              } else if (event.key === "Escape") {
                event.preventDefault();
                if (showSuggestions) { setSuggestionsOpen(false); setSelectedSuggestion(-1); }
                else { setAddress(activeTab?.url === "about:blank" ? "" : activeTab?.url ?? ""); addressRef.current?.select(); }
              } else if (event.key === "Tab") {
                setSuggestionsOpen(false);
              }
            }}
            value={address}
            onChange={(event) => { setAddress(event.target.value); setSuggestionsOpen(true); setSelectedSuggestion(-1); }}
            onFocus={() => { setSuggestionsOpen(true); setSelectedSuggestion(-1); }}
            onBlur={() => setSuggestionsOpen(false)}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls={showSuggestions ? "address-suggestions" : undefined}
            aria-activedescendant={showSuggestions && selectedSuggestion >= 0 ? `address-option-${selectedSuggestion}` : undefined}
            aria-label={t("address")}
            placeholder={t("address")}
            dir="auto"
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="submit"
            title={t("go")}
            aria-label={t("go")}
            disabled={m.busy}
          >
            <ChevronRight size={16} />
          </button>
          <IconButton
            label={t("addBookmark")}
            disabled={!activeTab || emptyBrowser || m.busy}
            onClick={() =>
              activeTab &&
              void m.run("bookmark_add", {
                url: activeTab.url,
                title: activeTab.title,
              })
            }
          >
            <Star size={16} />
          </IconButton>
          {showSuggestions && <div className="address-suggestions" ref={suggestionRef}>
            <div className="suggestions-heading">{m.locale === "ar" ? "من سجلك ومفضلتك" : "From your history and bookmarks"}<span>↑ ↓ · Enter</span></div>
            <div role="listbox" id="address-suggestions" aria-label={m.locale === "ar" ? "اقتراحات العنوان" : "Address suggestions"}>
              {suggestions.map((item, index) => <div key={item.url} id={`address-option-${index}`} role="option" aria-selected={selectedSuggestion === index}
                className={`address-option ${selectedSuggestion === index ? "selected" : ""}`}
                onMouseDown={event => event.preventDefault()} onClick={() => { setAddress(item.url); navigateAddress(item.url); }}>
                {item.bookmarked ? <Star size={17} aria-label={t("bookmarks")}/> : <Clock3 size={17} aria-label={t("history")}/>}
                <div><strong dir="auto">{item.title}</strong><span dir="ltr">{item.url}</span></div>
                <ChevronRight size={15}/>
              </div>)}
            </div>
          </div>}
        </form>
        <div className="zoom-controls" dir="ltr" aria-label={m.locale === "ar" ? "تكبير الصفحة" : "Page zoom"}>
          <IconButton label={m.locale === "ar" ? "تصغير (Ctrl−)" : "Zoom out (Ctrl−)"} disabled={emptyBrowser || m.busy || (activeTab?.zoom ?? 1) <= 0.25} onClick={() => zoom(-1)}><Minus size={14} /></IconButton>
          <button className="zoom-reset" disabled={emptyBrowser || m.busy} onClick={() => zoom(0)} title={m.locale === "ar" ? "الحجم الأصلي (Ctrl+0)" : "Reset zoom (Ctrl+0)"}>{Math.round((activeTab?.zoom ?? 1) * 100)}%</button>
        <IconButton label={m.locale === "ar" ? "تكبير (Ctrl+)" : "Zoom in (Ctrl+)"} disabled={emptyBrowser || m.busy || (activeTab?.zoom ?? 1) >= 5} onClick={() => zoom(1)}><Plus size={14} /></IconButton>
        </div>
          {activeTab && isYouTubeVideo(activeTab.url) && <IconButton label={m.locale === "ar" ? "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u064a\u062f\u064a\u0648" : "Download video"} onClick={() => { setVideoUrl(activeTab.url); m.setSection("downloads"); }}><ArrowDownToLine size={18}/></IconButton>}
        <IconButton label={m.locale === "ar" ? (theme.resolved === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي") : (theme.resolved === "dark" ? "Switch to light mode" : "Switch to dark mode")} onClick={() => theme.change(theme.resolved === "dark" ? "light" : "dark")}>
          {theme.resolved === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
        </IconButton>
        <IconButton label={m.locale === "ar" ? "بحث داخل الصفحة (Ctrl+F)" : "Find in page (Ctrl+F)"} disabled={emptyBrowser} onClick={() => { if (activeTab) { m.setSection("browser"); void m.run("tab_find", {id:activeTab.id}); } }}><Search size={18}/></IconButton>
        <IconButton label={m.locale === "ar" ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"} onClick={() => setShortcutsOpen(!shortcutsOpen)}><CircleHelp size={18} /></IconButton>
        <button
          className={`assistant-toggle ${assistantOpen ? "active" : ""}`}
          onClick={() => setAssistantOpen(!assistantOpen)}
        >
          <Sparkles size={17} />
          <span>{t("assistant")}</span>
        </button>
        <IconButton label={m.locale === "ar" ? (sidebarMode === "hidden" ? "إظهار القائمة الجانبية" : "إخفاء القائمة الجانبية") : (sidebarMode === "hidden" ? "Show sidebar" : "Hide sidebar")}
          active={sidebarMode !== "hidden"} onClick={() => changeSidebarMode(sidebarMode === "hidden" ? "compact" : "hidden")}><PanelLeftOpen size={18}/></IconButton>
      </div>
      <div className="workspace">
        <Sidebar model={m} mode={sidebarMode} onModeChange={changeSidebarMode} />
        <main className="main-content">
          {m.connectionError && (
            <div className="connection-banner" role="alert">
              <CircleHelp size={16} />
              {t("updateFailed")}
              <button onClick={() => void m.refresh()}>{t("retry")}</button>
            </div>
          )}
          {m.section === "browser" && (
            <div
              className="browser-area"
              ref={browserRef}
              aria-label={t("webContent")}
            >
              {(emptyBrowser || !m.isNative) && (
                <div className="start-page">
                  <div className="eyebrow">
                    <span />
                    {t("tagline")}
                  </div>
                  <div className="hero-mark">
                    <img src={labeebLogo} alt={t("brand")} width={112} height={112} />
                  </div>
                  <h1>{t("welcome")}</h1>
                  <p className="hero-description">{t("welcomeDetail")}</p>
                  <form
                    className="home-search"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void m.navigate(homeAddress);
                    }}
                  >
                    <Search size={20} />
                    <input
                      value={homeAddress}
                      onChange={(event) => setHomeAddress(event.target.value)}
                      placeholder={t("searchPlaceholder")}
                      aria-label={t("searchPlaceholder")}
                      dir="auto"
                    />
                    <button
                      disabled={m.busy}
                      title={t("go")}
                      aria-label={t("go")}
                    >
                      <ArrowLeft size={20} className="rtl-icon" />
                    </button>
                  </form>
                  <div className="feature-cards">
                    <article>
                      <Globe2 size={21} />
                      <h3>{t("nativeEngine")}</h3>
                      <p>{t("nativeEngineDetail")}</p>
                    </article>
                    <article>
                      <ShieldCheck size={21} />
                      <h3>{t("secure")}</h3>
                      <p>{t("secureDetail")}</p>
                    </article>
                    <article>
                      <TerminalSquare size={21} />
                      <h3>{t("separate")}</h3>
                      <p>{t("separateDetail")}</p>
                    </article>
                  </div>
                  {!m.isNative && (
                    <div className="native-notice">
                      <LockKeyhole size={19} />
                      <div>
                        <strong>{t("nativeOnly")}</strong>
                        <p>{t("nativeDetail")}</p>
                      </div>
                    </div>
                  )}
                  <div className="start-footer">
                    <LockKeyhole size={13} />
                    {t("browserNotice")}
                  </div>
                </div>
              )}
            </div>
          )}
          {(m.section === "history" || m.section === "bookmarks") && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">
                    {t(
                      m.section === "history"
                        ? "recentlyVisited"
                        : "savedPages",
                    )}
                  </p>
                  <h1>{t(m.section)}</h1>
                </div>
                {m.section === "history" && snapshot.history.length > 0 && (
                  <button
                    className="button danger subtle"
                    onClick={() => setConfirmHistory(true)}
                  >
                    <Trash2 size={16} />
                    {t("clearHistory")}
                  </button>
                )}
              </div>
              {(m.section === "history" ? snapshot.history : snapshot.bookmarks)
                .length === 0 ? (
                <EmptyState
                  icon={m.section === "history" ? Clock3 : Star}
                  title={t(
                    m.section === "history" ? "noHistory" : "noBookmarks",
                  )}
                  detail={t(
                    m.section === "history"
                      ? "noHistoryDetail"
                      : "noBookmarksDetail",
                  )}
                />
              ) : (
                <div className="saved-list">
                  {(m.section === "history"
                    ? snapshot.history
                    : snapshot.bookmarks
                  ).map((page) => (
                    <article className="saved-row" key={page.id}>
                      <PageMark url={page.url} />
                      <button
                        className="page-link"
                        onClick={async () => {
                          if (await m.run("tab_create", { url: page.url }))
                            m.setSection("browser");
                        }}
                      >
                        <strong>{page.title || t("pageTitle")}</strong>
                        <span dir="ltr">{page.url}</span>
                      </button>
                      {page.visitedAt && (
                        <time>{historyDate(page.visitedAt, m.locale)}</time>
                      )}
                      {m.section === "bookmarks" && (
                        <IconButton
                          label={t("remove")}
                          disabled={m.busy}
                          onClick={() =>
                            void m.queue("bookmark_remove", { id: page.id })
                          }
                        >
                          <X size={16} />
                        </IconButton>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {m.section === "downloads" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{t("localStorage")}</p>
                  <h1>{t("downloads")}</h1>
                </div>
              </div>
              <VideoDownloads key={videoUrl} m={m} initialUrl={videoUrl} />
              {snapshot.downloads.length === 0 ? null : (
                <div className="saved-list">
                  {snapshot.downloads.map((item) => (
                    <article className="download-row" key={item.id}>
                      <span className="page-mark">
                        <ArrowDownToLine size={21} />
                      </span>
                      <div className="download-info">
                        <strong>{item.name}</strong>
                        <span dir="ltr">{item.url}</span>
                        <div className="download-meta">
                          <span>
                            {item.status === "completed"
                              ? t("complete")
                              : [
                                    "pending",
                                    "running",
                                    "complete",
                                    "failed",
                                    "cancelled",
                                  ].includes(item.status)
                                ? t(item.status as TranslationKey)
                                : item.status}
                          </span>
                          <span>
                            {item.receivedBytes ?? 0} / {item.totalBytes ?? "—"}{" "}
                            {t("bytes")}
                          </span>
                        </div>
                        {item.error && <p className="field-hint" role="status">{item.error}</p>}
                        {!!item.totalBytes && (
                          <progress
                            max={item.totalBytes}
                            value={item.receivedBytes || 0}
                            aria-label={t("downloadStatus")}
                          />
                        )}
                      </div>
                      {["failed", "cancelled"].includes(item.status) && <button className="button" disabled={m.busy} onClick={() => void m.run("download_retry", {id:item.id})}>{m.locale === "ar" ? "إعادة المحاولة" : "Retry"}</button>}
                      {["pending", "running"].includes(item.status) && (
                        <IconButton
                          label={t("cancelDownload")}
                          onClick={() =>
                            void m.run("download_cancel", { id: item.id })
                          }
                        >
                          <X size={17} />
                        </IconButton>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {m.section === "approvals" && (
            <div className="content-page">
              <div className="page-heading">
                <div>
                  <p className="eyebrow">{t("privacy")}</p>
                  <h1>{t("approvals")}</h1>
                </div>
                <span className="status-pill">
                  <ShieldCheck size={14} />
                  {t("approvalRequired")}
                </span>
              </div>
              {snapshot.approvals.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title={t("noApprovals")}
                  detail={t("noApprovalsDetail")}
                />
              ) : (
                <div className="approval-list">
                  {snapshot.approvals.map((item) => (
                    <article className="approval-card" key={item.id}>
                      <div className="approval-top">
                        <span className="approval-type">
                          {approvalKindKeys[item.kind]
                            ? t(approvalKindKeys[item.kind])
                            : item.kind}
                        </span>
                        <ShieldCheck size={22} />
                      </div>
                      <h2>
                        {approvalSummaryKeys[item.summary]
                          ? t(approvalSummaryKeys[item.summary])
                          : item.summary}
                      </h2>
                      <dl>
                        <dt>{t("origin")}</dt>
                        <dd dir="auto">{item.origin}</dd>
                        {item.payload && (
                          <>
                            <dt>{t("details")}</dt>
                            <dd className="approval-details" dir="auto">
                              {approvalPayloadKeys[item.payload]
                                ? t(approvalPayloadKeys[item.payload])
                                : item.payload}
                            </dd>
                          </>
                        )}
                      </dl>
                      <p className="approval-warning">{t("approvalWarning")}</p>
                      <div className="button-row">
                        <button
                          className="button primary"
                          disabled={m.busy}
                          onClick={() =>
                            void m.run("approval_resolve", {
                              id: item.id,
                              approved: true,
                            })
                          }
                        >
                          <Check size={17} />
                          {t("approve")}
                        </button>
                        <button
                          className="button"
                          disabled={m.busy}
                          onClick={() =>
                            void m.run("approval_resolve", {
                              id: item.id,
                              approved: false,
                            })
                          }
                        >
                          <X size={17} />
                          {t("deny")}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
          {m.section === "automation" && <AutomationPanel model={m} />}
          {m.section === "settings" && <SettingsPanel model={m} theme={theme} />}
          {m.section === "diagnostics" && <DiagnosticsPanel locale={m.locale} />}
          {m.section === "about" && <AboutPanel model={m} />}
        </main>
        {assistantOpen && (
          <AssistantPanel model={m} onClose={() => setAssistantOpen(false)} />
        )}
      </div>
      <footer className="statusbar">
        <span>
          <span
            className={`status-dot ${m.isNative && !m.connectionError ? "connected" : ""}`}
          />
          {t(m.isNative ? "ready" : "notConnected")}
        </span>
        <span className="keyboard-hint">{t("keyboardHint")}</span>
        <span>
          <LockKeyhole size={12} />
          {t("buildLabel")}
        </span>
      </footer>
      {m.toast && (
        <div
          className={`toast ${m.toast.error ? "error" : ""}`}
          role={m.toast.error ? "alert" : "status"}
        >
          <span>{m.toast.text}</span>
          <IconButton label={t("dismiss")} onClick={() => m.setToast(null)}>
            <X size={15} />
          </IconButton>
        </div>
      )}
      {videoOffer && <VideoOffer offer={videoOffer} ar={m.locale === "ar"} busy={m.busy} close={()=>setVideoOffer(null)} download={async quality => {
        const ok = await m.run(quality === "direct" ? "video_direct" : "video_start", quality === "direct" ? {url:videoOffer.url} : {url:videoOffer.url,quality,folder:null});
        if(ok) setVideoOffer(null);
      }}/>}
      {shortcutsOpen && (
        <div className="modal-backdrop">
          <section ref={modalRef} className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title">{m.locale === "ar" ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</h2>
            <table><tbody>{[
              ["Ctrl+F", "البحث داخل الصفحة", "Find in page"],
              ["Ctrl+L / Alt+D / F6", "تحديد شريط العنوان", "Focus address"],
              ["Ctrl+Enter", "إكمال الاسم بـ www. و.com", "Complete a name with www. and .com"],
              ["Ctrl+T", "تبويب جديد", "New tab"],
              ["Ctrl+W", "إغلاق التبويب", "Close tab"],
              ["Ctrl+Shift+T", "إعادة فتح آخر تبويب مغلق", "Reopen last closed tab"],
              ["Ctrl+Tab / Ctrl+Shift+Tab", "التبويب التالي / السابق", "Next / previous tab"],
              ["Ctrl+1 … Ctrl+8 / Ctrl+9", "اختيار تبويب / آخر تبويب", "Select tab / last tab"],
              ["Ctrl+R / F5", "إعادة تحميل الصفحة", "Reload page"],
              ["Alt+← / Alt+→", "رجوع / تقدم", "Back / forward"],
              ["Ctrl+ + / Ctrl+ − / Ctrl+0", "تكبير / تصغير / الحجم الأصلي", "Zoom in / out / reset"],
              ["Ctrl+H / Ctrl+J", "السجل / التنزيلات", "History / downloads"],
              ["Ctrl+D", "إضافة إلى المفضلة", "Bookmark page"],
            ].map(([keys, ar, en]) => <tr key={keys}><td>{m.locale === "ar" ? ar : en}</td><td dir="ltr"><kbd>{keys}</kbd></td></tr>)}</tbody></table>
            <button autoFocus className="button" onClick={() => setShortcutsOpen(false)}>{t("dismiss")}</button>
          </section>
        </div>
      )}
      {confirmHistory && (
        <div className="modal-backdrop">
          <section
            ref={modalRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="modal"
          >
            <Trash2 size={24} />
            <h2 id="confirm-title">{t("clearHistory")}</h2>
            <p>{t("clearHistoryConfirm")}</p>
            <div className="button-row">
              <button
                className="button danger"
                onClick={() => {
                  setConfirmHistory(false);
                  void m.queue("history_clear");
                }}
              >
                {t("confirm")}
              </button>
              <button
                className="button"
                autoFocus
                onClick={() => setConfirmHistory(false)}
              >
                {t("cancel")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
