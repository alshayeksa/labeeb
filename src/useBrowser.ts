import { useCallback, useEffect, useRef, useState } from "react";
import { command, emptySnapshot, native, normalizeAddress } from "./bridge";
import type { Snapshot } from "./bridge";
import { listen } from "@tauri-apps/api/event";
import { translate } from "./i18n";
import type { Locale, TranslationKey } from "./i18n";
export type Section =
  | "browser"
  | "history"
  | "bookmarks"
  | "downloads"
  | "approvals"
  | "automation"
  | "diagnostics"
  | "about"
  | "settings";
export function useBrowser() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot),
    [locale, setLocale] = useState<Locale>("ar"),
    [section, setSection] = useState<Section>("browser"),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [connectionError, setConnectionError] = useState(false);
  const isNative = native(),
    sequence = useRef(0),
    pending = useRef(false),
    busyRef = useRef(false),
    mounted = useRef(true);
  const snapshotRef = useRef(snapshot), sectionRef = useRef(section), libraryRevision = useRef<number | null>(null), lastWire = useRef("");
  const reschedule = useRef(() => {});
  snapshotRef.current = snapshot;
  sectionRef.current = section;
  const t = useCallback(
    (key: TranslationKey) => translate(locale, key),
    [locale],
  );
  const notify = useCallback(
    (text: string, error = false) => setToast({ text, error }),
    [],
  );
  const refresh = useCallback(
    async (force = false) => {
      if (!isNative || (pending.current && !force)) return;
      const ticket = ++sequence.current;
      pending.current = true;
      try {
        const result = await command<Snapshot>("app_snapshot", {
          libraryRevision: libraryRevision.current,
          includeFrame: sectionRef.current === "automation" && document.visibilityState !== "hidden",
        });
        if (mounted.current && ticket === sequence.current) {
          libraryRevision.current = result.libraryRevision ?? null;
          const wire = JSON.stringify(result);
          if (wire !== lastWire.current) {
            lastWire.current = wire;
            const merged = {...result, history:result.history ?? snapshotRef.current.history, bookmarks:result.bookmarks ?? snapshotRef.current.bookmarks};
            snapshotRef.current = merged;
            setSnapshot(merged);
          }
          setLocale(result.settings.locale);
          setConnectionError(false);
        }
      } catch {
        if (mounted.current && ticket === sequence.current)
          setConnectionError(true);
      } finally {
        if (ticket === sequence.current) pending.current = false;
      }
    },
    [isNative],
  );
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (disposed || !isNative || document.visibilityState === "hidden") return;
      const state = snapshotRef.current;
      const active = (state.video?.jobs.some(j => !["completed", "failed", "cancelled"].includes(j.status)) ?? false) || state.tabs.some(tab => tab.loading) || state.downloads.some(item => item.status === "running") ||
        (sectionRef.current === "automation" && state.automation.status === "running");
      timer = setTimeout(() => { void refresh().finally(schedule); }, active ? 1200 : 10000);
    };
    const changed = () => {
      clearTimeout(debounce);
      if (document.visibilityState === "hidden") { clearTimeout(timer); void refresh(); return; }
      debounce = setTimeout(() => { void refresh().finally(schedule); }, 80);
    };
    reschedule.current = schedule;
    if (isNative) {
      void listen("browser-state-changed", changed).then(fn => { if (disposed) fn(); else { unlisten = fn; changed(); } }).catch(() => {});
      void refresh().finally(schedule);
      document.addEventListener("visibilitychange", changed);
      window.addEventListener("focus", changed);
    }
    return () => {
      disposed = true; mounted.current = false;
      reschedule.current = () => {};
      clearTimeout(timer); clearTimeout(debounce); unlisten?.();
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener("focus", changed);
    };
  }, [refresh, isNative]);
  const previousSection = useRef(section);
  useEffect(() => {
    if (previousSection.current !== section) { previousSection.current = section; void refresh(true).finally(() => reschedule.current()); }
  }, [section, refresh]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);
  const run = useCallback(
    async (name: string, args?: Record<string, unknown>, success?: string) => {
      if (!isNative) {
        notify(t("nativeRequired"), true);
        return false;
      }
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      try {
        await command(name, args);
        await refresh(true);
        reschedule.current();
        if (success) notify(success);
        return true;
      } catch (error) {
        notify(String(error), true);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [isNative, notify, refresh, t],
  );
  const activeTab = snapshot.tabs.find(
    (tab) => tab.id === snapshot.activeTabId,
  );
  const createTab = useCallback(async () => {
    if (await run("tab_create", { url: "about:blank" })) setSection("browser");
  }, [run]);
  const navigate = async (value: string) => {
    let url: string;
    try {
      url = normalizeAddress(value);
    } catch {
      notify(t("unavailable"), true);
      return;
    }
    if (!url) return;
    const ok = await run(
      activeTab ? "tab_navigate" : "tab_create",
      activeTab ? { id: activeTab.id, url } : { url },
    );
    if (ok) setSection("browser");
  };
  const switchLocale = async (value: Locale) => {
    if (isNative) await run("settings_update", { locale: value });
    else setLocale(value);
  };
  const queue = async (name: string, args?: Record<string, unknown>) => {
    if (await run(name, args, t("approvalPending"))) setSection("approvals");
  };
  return {
    snapshot,
    locale,
    section,
    setSection,
    busy,
    toast,
    setToast,
    connectionError,
    isNative,
    t,
    notify,
    refresh,
    run,
    activeTab,
    createTab,
    navigate,
    switchLocale,
    queue,
  };
}
export type BrowserModel = ReturnType<typeof useBrowser>;
