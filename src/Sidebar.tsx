import { useRef, useState } from "react";
import { ArrowDownToLine, Clock3, Globe2, Info, Languages, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Settings2, ShieldCheck, Star, TerminalSquare, X } from "lucide-react";
import type { BrowserModel, Section } from "./useBrowser";

export type SidebarMode = "compact" | "expanded" | "hidden";
const preferenceKey = "labeeb.sidebar-mode";
export function readSidebarMode(): SidebarMode {
  try { const value = localStorage.getItem(preferenceKey); if (value === "expanded" || value === "hidden") return value; } catch { /* Storage may be unavailable. */ }
  return "compact";
}
export function saveSidebarMode(mode: SidebarMode) {
  try { localStorage.setItem(preferenceKey, mode); } catch { /* Keep the in-session choice. */ }
}
const primary = [{key:"browser", icon:Globe2}, {key:"bookmarks", icon:Star}, {key:"history", icon:Clock3}, {key:"downloads", icon:ArrowDownToLine}] as const;
const extra = [{key:"diagnostics", icon:Clock3}, {key:"automation", icon:TerminalSquare}, {key:"approvals", icon:ShieldCheck}, {key:"about", icon:Info}] as const;

export default function Sidebar({model:m, mode, onModeChange}: {model:BrowserModel; mode:SidebarMode; onModeChange:(mode:SidebarMode)=>void}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const ar = m.locale === "ar";
  const expanded = mode === "expanded" || moreOpen;
  const item = (key:Section, Icon:typeof Globe2) => <button key={key} type="button" title={m.t(key)} aria-label={m.t(key)}
    aria-current={m.section === key ? "page" : undefined} className={`rail-button ${m.section === key ? "active" : ""}`}
    onClick={() => { m.setSection(key); setMoreOpen(false); }}><Icon size={19}/><span className="rail-label">{m.t(key)}</span>
    {key === "approvals" && m.snapshot.approvals.length > 0 && <span className="count-dot">{m.snapshot.approvals.length}</span>}</button>;
  if (mode === "hidden") return null;
  return <nav className={`rail adaptive-rail ${expanded ? "expanded" : "compact"}`} aria-label={m.t("browser")}
    onKeyDown={e => { if (e.key === "Escape" && moreOpen) { setMoreOpen(false); moreRef.current?.focus(); } }}>
    <div className="rail-main">
      <button type="button" className="rail-button rail-size" title={ar ? (expanded ? "طي القائمة" : "توسيع القائمة") : (expanded ? "Collapse sidebar" : "Expand sidebar")}
        aria-label={ar ? (expanded ? "طي القائمة" : "توسيع القائمة") : (expanded ? "Collapse sidebar" : "Expand sidebar")}
        aria-expanded={expanded} onClick={() => { setMoreOpen(false); onModeChange(expanded ? "compact" : "expanded"); }}>
        {expanded ? <PanelLeftClose size={19}/> : <PanelLeftOpen size={19}/>}
        <span className="rail-label">{ar ? "طي القائمة" : "Collapse sidebar"}</span>
      </button>
      <div className="rail-divider"/>
      {primary.map(({key,icon}) => item(key,icon))}
    </div>
    <div className="rail-bottom">
      {moreOpen && <div id="sidebar-more" className="rail-more">{extra.map(({key,icon}) => item(key,icon))}</div>}
      <button ref={moreRef} type="button" className={`rail-button ${extra.some(x=>x.key===m.section) ? "active" : ""}`} title={ar ? "المزيد" : "More"} aria-label={ar ? "المزيد" : "More"}
        aria-expanded={moreOpen} aria-controls="sidebar-more" onClick={() => setMoreOpen(!moreOpen)}>
        <MoreHorizontal size={19}/><span className="rail-label">{ar ? "المزيد" : "More"}</span>
        {m.snapshot.approvals.length > 0 && <span className="count-dot">{m.snapshot.approvals.length}</span>}
      </button>
      {item("settings",Settings2)}
      <button type="button" className="rail-button" title={m.t("language")} aria-label={m.t("language")} onClick={() => void m.switchLocale(ar ? "en" : "ar")}><Languages size={19}/><span className="rail-label">{ar ? "English" : "العربية"}</span></button>
      <button type="button" className="rail-button" title={ar ? "إخفاء القائمة" : "Hide sidebar"} aria-label={ar ? "إخفاء القائمة" : "Hide sidebar"} onClick={() => onModeChange("hidden")}><X size={17}/><span className="rail-label">{ar ? "إخفاء القائمة" : "Hide sidebar"}</span></button>
    </div>
  </nav>;
}
