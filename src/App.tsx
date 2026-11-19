import labeebLogo from "./assets/labeeb-logo.png";
import VideoDownloads, { isYouTubeVideo } from "./VideoDownloads";
import VideoOffer from "./VideoOffer";
import PasswordPrompts from "./PasswordPrompts";
import { KeyRound } from "./icons";
import type { VideoOfferData } from "./VideoOffer";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  CircleHelp,
  Clock3,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Minus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "./icons";
import { listen } from "@tauri-apps/api/event";
import { completeAddress, displayAddress, nextZoom, command } from "./bridge";
import { useBrowser } from "./useBrowser";
import TabStrip from "./TabStrip";
import Sidebar, { readSidebarMode, saveSidebarMode } from "./Sidebar";
import type { SidebarMode } from "./Sidebar";
import { addressSuggestions } from "./addressSuggestions";
import { IconButton } from "./components";
import AssistantPanel from "./AssistantPanel";
import SettingsPanel from "./SettingsPanel";
import AboutPanel from "./AboutPanel";
import SavedLibrary from "./SavedLibrary";
import { Moon, Sun } from "./icons";
import { useTheme } from "./theme";
import { activeDownloadCount, useDownloadFlash } from "./downloadFlash";
import { openViora, youtubeVideoId } from "./viora";
import { Clapperboard } from "./icons";
export default function App() {
  const theme = useTheme();
  const [videoUrl, setVideoUrl] = useState("");
  const [videoOffer, setVideoOffer] = useState<VideoOfferData | null>(null);
  const lastVideoOffer = useRef(0);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState(false);
  const [passwordFillTab, setPasswordFillTab] = useState<string | null>(null);
  const closePasswordFill = useCallback(() => setPasswordFillTab(null), []);
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
  const [fullscreenControls, setFullscreenControls] = useState(false);
  const immersive = !!snapshot.fullscreen && m.section === "browser" && !fullscreenControls;
  // Finish resetting before paint, so a following Ctrl+L isn't undone by a late effect.
  useLayoutEffect(() => { setFullscreenControls(false); }, [snapshot.fullscreen]);
  const crashNotice = useRef(() => {});
  crashNotice.current = () => m.notify(m.locale === "ar" ? "توقفت هذه الصفحة عن العمل. أعد تحميلها للمتابعة (F5)." : "This page stopped working. Reload it to continue (F5).", true);
  useEffect(() => {
    if (!m.isNative) return;
    let disposed = false; let stop: (()=>void) | undefined;
    void listen("tab-crashed", () => crashNotice.current()).then(fn=>{if(disposed) fn(); else stop=fn;}).catch(()=>{});
    return ()=>{disposed=true;stop?.();};
  }, [m.isNative]);
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const [assistantOpen, setAssistantOpen] = useState(false),
    [address, setAddress] = useState(""),
    [homeAddress, setHomeAddress] = useState(""),
    [confirmHistory, setConfirmHistory] = useState(false),
    [shortcutsOpen, setShortcutsOpen] = useState(false),
    [sidebarMode, setSidebarMode] = useState<SidebarMode>(readSidebarMode),
    [suggestionsOpen, setSuggestionsOpen] = useState(false),
    [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const assistantModel = useMemo(() => ({ t:m.t, notify:m.notify, isNative:m.isNative, refresh:m.refresh, locale:m.locale, aiConfigured:snapshot.settings.aiConfigured }), [m.t,m.notify,m.isNative,m.refresh,m.locale,snapshot.settings.aiConfigured]);
  const closeAssistant = useCallback(() => { setAssistantOpen(false); assistantTrigger.current?.focus(); }, []);
  const openAssistantSettings = useCallback(() => m.setSection("settings"), [m.setSection]);
  const openAssistantLink = useCallback(async (url: string) => {
    if (await m.run('tab_create', {url})) m.setSection('browser');
  }, [m.run, m.setSection]);
  const suggestionRef = useRef<HTMLDivElement>(null);
  const suggestions = useMemo(() => addressSuggestions(address, snapshot.history, snapshot.bookmarks), [address, snapshot.history, snapshot.bookmarks]);
  const showSuggestions = suggestionsOpen && suggestions.length > 0;
  const changeSidebarMode = (mode: SidebarMode) => { setSidebarMode(mode); saveSidebarMode(mode); };
  const navigateAddress = (value: string) => { setFullscreenControls(false); setSuggestionsOpen(false); setSelectedSuggestion(-1); void m.navigate(value); };
  const addressRef = useRef<HTMLInputElement>(null),
    browserRef = useRef<HTMLDivElement>(null),
    modalRef = useRef<HTMLElement>(null),
    toastRef = useRef<HTMLDivElement>(null),
    lastAddressContext = useRef({ id: null as string | null, url: "" });
  const emptyBrowser = !activeTab || activeTab.url === "about:blank";
  // The star is filled while the page being viewed is in Bookmarks.
  const bookmark = useMemo(() => {
    if (!activeTab || activeTab.url === "about:blank") return undefined;
    const same = (a: string, b: string) => { if (a === b) return true; try { return new URL(a).href === new URL(b).href; } catch { return false; } };
    return snapshot.bookmarks.find(page => same(page.url, activeTab.url));
  }, [snapshot.bookmarks, activeTab?.url]);
  const activeDownloads = activeDownloadCount(snapshot);
  const downloadFlash = useDownloadFlash(activeDownloads);
  const connectionKind = activeTab?.url.startsWith("https://")
    ? "httpsConnection"
    : activeTab?.url.startsWith("http://")
      ? "httpConnection"
      : "noConnection";
  useEffect(() => {
    document.title = `${m.section === "browser" ? activeTab?.title || t("newTab") : t(m.section)} · ${t("brand")}`;
  }, [t, activeTab?.title, m.section]);
  useEffect(() => {
    const url = activeTab?.url || "";
    if (
      lastAddressContext.current.url !== url ||
      lastAddressContext.current.id !== snapshot.activeTabId
    ) {
      lastAddressContext.current = { id: snapshot.activeTabId, url };
      setAddress(url === "about:blank" ? "" : displayAddress(url));
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
  const focusAddress = useCallback(() => {
    setFullscreenControls(true);
    requestAnimationFrame(() => { addressRef.current?.focus(); addressRef.current?.select(); });
  }, []);
  const newTab = useCallback(async () => { await m.createTab(); focusAddress(); }, [m.createTab, focusAddress]);
  const selectTab = useCallback((id: string) => { setFullscreenControls(false); m.setSection("browser"); void m.run("tab_select", {id}); }, [m.setSection, m.run]);
  const closeTab = useCallback((id: string) => { void m.run("tab_close", {id}); }, [m.run]);
  const zoom = (direction: number) => {
    if (activeTab) void m.run("tab_zoom", { id: activeTab.id,
      scale: direction === 0 ? 1 : nextZoom(activeTab.zoom ?? 1, direction) });
  };
  const handleKey = (key: string, ctrl: boolean, shift: boolean, alt: boolean) => {
    key = key.toLowerCase();
    if (key === "escape" && snapshot.fullscreen && fullscreenControls) { setFullscreenControls(false); return true; }
    if (key === "f11" && !ctrl && !shift && !alt) { void m.run("window_fullscreen_toggle"); return true; }
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
      if (event.key === "F11" && event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); return; }
      if (keyHandler.current(event.key, event.ctrlKey || event.metaKey, event.shiftKey, event.altKey)) event.preventDefault();
    };
    document.addEventListener("keydown", handler);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (m.isNative) void listen<{code: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean}>("browser-key", ({payload: e}) => {
      const key = ({9:"Tab",37:"ArrowLeft",39:"ArrowRight",116:"F5",117:"F6",122:"F11"} as Record<number,string>)[e.code] ?? String.fromCharCode(e.code);
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
      // A notice keeps the page on screen: only the strip it covers is given up.
      const noticeTop = passwordNotice ? document.querySelector('.password-save-notice')?.getBoundingClientRect().top : undefined;
      const toastTop = Math.min(m.toast ? toastRef.current?.getBoundingClientRect().top ?? Infinity : Infinity, noticeTop ?? Infinity);
      const cut = rect && toastTop !== undefined ? Math.min(Math.max(0, rect.bottom - toastTop + 8), Math.max(0, rect.height - offset - 1)) : 0;
      const visible =
        m.section === "browser" &&
        !confirmHistory &&
        !shortcutsOpen &&
        !videoOffer &&
        !passwordModal &&
        !emptyBrowser &&
        !!rect;
      void command("browser_bounds", {
        x: rect?.x ?? 0,
        y: (rect?.y ?? 0) + offset,
        width: Math.max(1, rect?.width ?? 1),
        height: Math.max(1, (rect?.height ?? 1) - offset - cut),
        visible,
      }).catch(() => {});
    };
    update();
    const observer = new ResizeObserver(update);
    if (browserRef.current) observer.observe(browserRef.current);
    const notice = document.querySelector(".password-save-notice");
    if (notice) observer.observe(notice);
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
    // RTL/LTR moves the native surface without changing its size; ResizeObserver
    // alone cannot detect that position change.
    m.locale,
    assistantOpen,
    immersive,
    confirmHistory,
    shortcutsOpen,
    videoOffer,
    passwordModal,
    passwordNotice,
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
    <div className={`app-shell ${immersive ? "immersive" : ""}`} dir={m.locale === "ar" ? "rtl" : "ltr"}>
      <header className="titlebar" hidden={immersive}>
        <div className="brand" dir="rtl">
          <span className="brand-symbol">
            <img src={labeebLogo} alt="" width={30} height={30} />
          </span>
          <strong>{t("brand")}</strong>
          <div className="brand-language" role="group" aria-label={t("language")} dir="ltr">
            <button type="button" lang="ar" aria-pressed={m.locale === "ar"} disabled={m.busy} onClick={() => void m.switchLocale("ar")}>عربي</button>
            <span aria-hidden="true">/</span>
            <button type="button" lang="en" aria-pressed={m.locale === "en"} disabled={m.busy} onClick={() => void m.switchLocale("en")}>English</button>
          </div>
        </div>
        <TabStrip tabs={snapshot.tabs} activeId={snapshot.activeTabId} locale={m.locale} t={t} onSelect={selectTab} onClose={closeTab} onNew={newTab} showingBrowser={m.section === "browser"}/>
        <button type="button" className="maker-badge" dir="ltr"
          title={m.locale === "ar" ? "افتح alshaye.ai في تبويب جديد" : "Open alshaye.ai in a new tab"}
          aria-label={m.locale === "ar" ? "By Shaye Alshaye — افتح alshaye.ai في تبويب جديد" : "By Shaye Alshaye — open alshaye.ai in a new tab"}
          onClick={async () => { if (await m.run("tab_create", { url: "https://alshaye.ai/" })) m.setSection("browser"); }}>
          <span className="maker-by">By</span> Shaye Alshaye
        </button>
        <span className="private-pill">
          <ShieldCheck size={13} />
          {t("local")}
        </span>
      </header>
      <div className="toolbar" hidden={immersive}>
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
                else { setAddress(activeTab?.url === "about:blank" ? "" : displayAddress(activeTab?.url ?? "")); addressRef.current?.select(); }
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
          <span className={`bookmark-star ${bookmark ? "saved" : ""}`}>
            <IconButton
              label={bookmark ? (m.locale === "ar" ? "في المفضلة — اضغط للإزالة" : "Bookmarked — click to remove") : t("addBookmark")}
              disabled={!activeTab || emptyBrowser || m.busy}
              active={!!bookmark}
              onClick={() => {
                if (!activeTab) return;
                if (bookmark) void m.run("bookmark_unstar", { id: bookmark.id }, m.locale === "ar" ? "أُزيلت الصفحة من المفضلة." : "Removed from bookmarks.");
                else void m.run("bookmark_add", { url: activeTab.url, title: activeTab.title }, m.locale === "ar" ? "أُضيفت الصفحة إلى المفضلة." : "Added to bookmarks.");
              }}
            >
              <Star size={16} fill={bookmark ? "currentColor" : "none"} />
            </IconButton>
          </span>
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
        {snapshot.settings.passwordSaveSupported && <IconButton label={m.locale === "ar" ? "تعبئة من خزنة لبيب" : "Fill from Labeeb’s vault"} disabled={!m.isNative || !activeTab?.url.startsWith("https://") || m.section !== "browser"} onClick={() => setPasswordFillTab(activeTab?.id ?? null)}><KeyRound size={18}/></IconButton>}
        <div className="zoom-controls" dir="ltr" aria-label={m.locale === "ar" ? "تكبير الصفحة" : "Page zoom"}>
          <IconButton label={m.locale === "ar" ? "تصغير (Ctrl−)" : "Zoom out (Ctrl−)"} disabled={emptyBrowser || m.busy || (activeTab?.zoom ?? 1) <= 0.25} onClick={() => zoom(-1)}><Minus size={14} /></IconButton>
          <button className="zoom-reset" disabled={emptyBrowser || m.busy} onClick={() => zoom(0)} title={m.locale === "ar" ? "الحجم الأصلي (Ctrl+0)" : "Reset zoom (Ctrl+0)"}>{Math.round((activeTab?.zoom ?? 1) * 100)}%</button>
        <IconButton label={m.locale === "ar" ? "تكبير (Ctrl+)" : "Zoom in (Ctrl+)"} disabled={emptyBrowser || m.busy || (activeTab?.zoom ?? 1) >= 5} onClick={() => zoom(1)}><Plus size={14} /></IconButton>
        </div>
          {activeDownloads > 0 && <button type="button" className={`download-indicator ${downloadFlash ? "download-flash" : ""}`} onClick={() => m.setSection("downloads")}
            title={m.locale === "ar" ? "تحميل جارٍ — افتح التنزيلات" : "Downloading — open Downloads"}
            aria-label={m.locale === "ar" ? `تحميلات جارية: ${activeDownloads}. افتح التنزيلات` : `Downloads in progress: ${activeDownloads}. Open Downloads`}>
            <LoaderCircle size={15} className="spin" /><ArrowDownToLine size={15} /><span>{activeDownloads}</span>
          </button>}
          {activeTab && youtubeVideoId(activeTab.url) && <button type="button" className="viora-watch" disabled={m.busy}
            title={m.locale === "ar" ? "شاهد هذا الفيديو بلا إعلانات في برنامج Viora" : "Watch this video ad-free in the Viora program"}
            onClick={() => void openViora(m, activeTab.url)}>
            <Clapperboard size={16}/><span>{m.locale === "ar" ? "بلا إعلانات" : "Ad-free"}</span>
          </button>}
          {activeTab && isYouTubeVideo(activeTab.url) && <IconButton label={m.locale === "ar" ? "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u064a\u062f\u064a\u0648" : "Download video"} onClick={() => { setVideoUrl(activeTab.url); m.setSection("downloads"); }}><ArrowDownToLine size={18}/></IconButton>}
        <IconButton label={m.locale === "ar" ? (theme.resolved === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي") : (theme.resolved === "dark" ? "Switch to light mode" : "Switch to dark mode")} onClick={() => theme.change(theme.resolved === "dark" ? "light" : "dark")}>
          {theme.resolved === "dark" ? <Sun size={18}/> : <Moon size={18}/>}
        </IconButton>
        <IconButton label={m.locale === "ar" ? "بحث داخل الصفحة (Ctrl+F)" : "Find in page (Ctrl+F)"} disabled={emptyBrowser} onClick={() => { if (activeTab) { m.setSection("browser"); void m.run("tab_find", {id:activeTab.id}); } }}><Search size={18}/></IconButton>
        <IconButton label={m.locale === "ar" ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"} onClick={() => setShortcutsOpen(!shortcutsOpen)}><CircleHelp size={18} /></IconButton>
        <button
          ref={assistantTrigger}
          className={`assistant-toggle ${assistantOpen ? "active" : ""}`}
          aria-expanded={assistantOpen}
          aria-controls={assistantOpen ? "assistant-panel" : undefined}
          onClick={() => setAssistantOpen(!assistantOpen)}
        >
          <Sparkles size={17} />
          <span>{t("assistant")}</span>
        </button>
      </div>
      <div className={`workspace ${assistantOpen && !immersive ? "assistant-open" : "assistant-closed"}`}>
        {!immersive && <Sidebar model={m} mode={sidebarMode} onModeChange={changeSidebarMode} />}
        <main key={m.section} className={`main-content${m.section !== "browser" ? " internal-page-scroll" : ""}`}>
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
              id="browser-content"
              role={activeTab ? "tabpanel" : undefined}
              aria-labelledby={activeTab && !immersive ? `tab-label-${activeTab.id}` : undefined}
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
                      <ShieldCheck size={21} />
                      <h3>{t("secure")}</h3>
                      <p>{t("secureDetail")}</p>
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
              <SavedLibrary key={m.section} model={m} history={m.section === "history"} />
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
            </div>
          )}
          {m.section === "settings" && <SettingsPanel model={m} theme={theme} />}
          {m.section === "about" && <AboutPanel model={m} />}
        </main>
        <AssistantPanel model={assistantModel} tabs={snapshot.tabs} activeId={snapshot.activeTabId} open={assistantOpen && !immersive} onClose={closeAssistant} onOpenSettings={openAssistantSettings} onOpenLink={openAssistantLink} />
      </div>
      <footer className="statusbar" hidden={immersive}>
        <span>
          <span
            className={`status-dot ${m.isNative && !m.connectionError ? "connected" : ""}`}
          />
          {t(m.isNative ? "ready" : "notConnected")}
        </span>
        <span className="keyboard-hint">{t("keyboardHint")}</span>
      </footer>
      {m.toast && (
        <div
          ref={toastRef}
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
        const ok = await m.run(quality === "direct" ? "video_direct" : "video_start", quality === "direct" ? {url:videoOffer.url} : {url:videoOffer.url,quality,folder:null},
          m.locale === "ar" ? "بدأ تحميل الفيديو. تابعه من زر التحميل في الشريط أو من «التنزيلات»." : "Video download started. Follow it from the toolbar download button or in Downloads.");
        if(ok) setVideoOffer(null);
      }}/>}
      <PasswordPrompts ar={m.locale === "ar"} native={m.isNative} activeTab={snapshot.activeTabId} fillTab={passwordFillTab} closeFill={closePasswordFill} onOpenChange={setPasswordModal} onOfferChange={setPasswordNotice} notify={m.notify}/>
      {shortcutsOpen && (
        <div className="modal-backdrop">
          <section ref={modalRef} className="modal shortcuts-modal" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
            <h2 id="shortcuts-title">{m.locale === "ar" ? "اختصارات لوحة المفاتيح" : "Keyboard shortcuts"}</h2>
            <table><tbody>{[
              ["Ctrl+F", "البحث داخل الصفحة", "Find in page"],
              ["Ctrl+L / Alt+D / F6", "تحديد شريط العنوان وإظهاره أثناء ملء الشاشة", "Focus address / reveal controls in full screen"],
              ["Ctrl+Enter", "إكمال الاسم بـ www. و.com", "Complete a name with www. and .com"],
              ["Ctrl+T", "تبويب جديد", "New tab"],
              ["Ctrl+W", "إغلاق التبويب", "Close tab"],
              ["Ctrl+Shift+T", "إعادة فتح آخر تبويب مغلق", "Reopen last closed tab"],
              ["Ctrl+Tab / Ctrl+Shift+Tab", "التبويب التالي / السابق", "Next / previous tab"],
              ["Ctrl+1 … Ctrl+8 / Ctrl+9", "اختيار تبويب / آخر تبويب", "Select tab / last tab"],
              ["Ctrl+R / F5", "إعادة تحميل الصفحة", "Reload page"],
              ["F11", "عرض الصفحة بملء الشاشة / العودة", "Full-screen page / return to window"],
              ["Escape", "إخفاء الأدوات الظاهرة أثناء ملء الشاشة", "Hide revealed controls in full screen"],
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
                  void m.run("history_clear");
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
