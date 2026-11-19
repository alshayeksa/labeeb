import { ArrowDownToLine, Clock3, Globe2, Info, PanelLeftClose, PanelLeftOpen, Settings, Star, Play } from "./icons";
import type { BrowserModel, Section } from "./useBrowser";
import { activeDownloadCount, useDownloadFlash } from "./downloadFlash";
import { openViora } from "./viora";

export type SidebarMode = "compact" | "expanded";
const preferenceKey = "labeeb.sidebar-mode";
export function readSidebarMode(): SidebarMode {
  try { if (localStorage.getItem(preferenceKey) === "expanded") return "expanded"; } catch { /* Use compact mode. */ }
  return "compact";
}
export function saveSidebarMode(mode: SidebarMode) {
  try { localStorage.setItem(preferenceKey, mode); } catch { /* Keep the in-session choice. */ }
}
const primary = [{key:"browser", icon:Globe2}, {key:"bookmarks", icon:Star}, {key:"history", icon:Clock3}, {key:"downloads", icon:ArrowDownToLine}] as const;

export default function Sidebar({model:m, mode, onModeChange}: {model:BrowserModel; mode:SidebarMode; onModeChange:(mode:SidebarMode)=>void}) {
  const ar = m.locale === "ar";
  const expanded = mode === "expanded";
  const activeDownloads = activeDownloadCount(m.snapshot);
  const downloadFlash = useDownloadFlash(activeDownloads);
  const vioraLabel = ar ? "Viora - يوتيوب بدون إعلانات" : "Viora - YouTube without ads";
  const item = (key:Section, Icon:typeof Globe2) => <button key={key} type="button" title={m.t(key)} aria-label={m.t(key)}
    aria-current={m.section === key ? "page" : undefined} className={`rail-button ${m.section === key ? "active" : ""} ${key === "downloads" && downloadFlash ? "download-flash" : ""}`}
    onClick={() => m.setSection(key)}><Icon size={21}/><span className="rail-label">{m.t(key)}</span>
    {key === "downloads" && activeDownloads > 0 && <span className="count-dot">{activeDownloads}</span>}</button>;
  return <nav className={`rail adaptive-rail ${expanded ? "expanded" : "compact"}`} aria-label={m.t("browser")}>
    <div className="rail-main">
      <button type="button" className="rail-button rail-size" title={ar ? (expanded ? "طي القائمة" : "توسيع القائمة") : (expanded ? "Collapse sidebar" : "Expand sidebar")}
        aria-label={ar ? (expanded ? "طي القائمة" : "توسيع القائمة") : (expanded ? "Collapse sidebar" : "Expand sidebar")}
        aria-expanded={expanded} onClick={() => onModeChange(expanded ? "compact" : "expanded")}>
        {expanded ? <PanelLeftClose size={21}/> : <PanelLeftOpen size={21}/>}
        <span className="rail-label">{ar ? "طي القائمة" : "Collapse sidebar"}</span>
      </button>
      <div className="rail-divider"/>
      {primary.map(({key,icon}) => item(key,icon))}
      <div className="rail-divider"/>
      <button type="button" className="rail-button viora-button" disabled={m.busy} title={vioraLabel} aria-label={vioraLabel}
        onClick={() => void openViora(m)}><Play size={21}/><span className="rail-label viora-label"><b dir="ltr">Viora</b><small>{ar ? "يوتيوب بدون إعلانات" : "YouTube without ads"}</small></span></button>
    </div>
    <div className="rail-bottom">
      {item("settings",Settings)}
      {item("about",Info)}
    </div>
  </nav>;
}
