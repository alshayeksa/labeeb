import { memo, useEffect, useRef, useState } from "react";
import { useFavicon } from "./favicon";
import { Globe2, LoaderCircle, Plus, X } from "./icons";
import { IconButton } from "./components";
import type { Tab } from "./bridge";
import type { Locale, TranslationKey } from "./i18n";
interface Props {
  tabs: Tab[]; activeId: string | null; locale: Locale;
  t: (key: TranslationKey) => string;
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void;
  showingBrowser: boolean;
}
const TabItem = memo(function TabItem({tab, active, locale, t, onSelect, onClose, showingBrowser}: Omit<Props,"tabs"|"activeId"|"onNew"> & {tab:Tab;active:boolean}) {
  const title = !tab.title || tab.title === "New tab" ? t("newTabLabel") : tab.title;
  const favicon = useFavicon(tab.icon);
  // An icon the engine cannot draw falls back to the globe.
  const [broken, setBroken] = useState<string>();
  return <div role="presentation" className={`tab ${active ? "active" : ""}`}
    onAuxClick={event=>{if(event.button===1){event.preventDefault();onClose(tab.id);}}}>
    <button type="button" role="tab" id={`tab-label-${tab.id}`} data-tab-id={tab.id}
      aria-selected={active} aria-controls={showingBrowser ? "browser-content" : undefined} tabIndex={active ? 0 : -1}
      title={tab.deferred && tab.url !== "about:blank" ? (locale === "ar" ? "سيُحمّل عند فتحه لتوفير الذاكرة" : "Loads when selected to save memory") : title}
      onClick={()=>onSelect(tab.id)}>
      {tab.loading ? <LoaderCircle size={16} className="spin tab-icon"/>
        : favicon && favicon !== broken ? <img className="tab-icon" src={favicon} alt="" width={16} height={16} draggable={false} onError={()=>setBroken(favicon)}/>
        : <Globe2 size={16} className="tab-icon"/>}
      <span dir="auto">{title}</span>
    </button>
    <button type="button" className="tab-close" tabIndex={active ? 0 : -1} title={t("closeTab")} aria-label={`${t("closeTab")}: ${title}`} onClick={()=>onClose(tab.id)}><X size={12}/></button>
  </div>;
});
export default memo(function TabStrip({tabs,activeId,locale,t,onSelect,onClose,onNew,showingBrowser}: Props) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const selected = list.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    selected?.scrollIntoView?.({block:"nearest",inline:"nearest"});
  },[activeId]);
  return <div ref={list} className="tab-strip" role="tablist" aria-label={t("tabs")} onKeyDown={event=>{
    if(event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const target=event.target as HTMLElement;
    if(target.getAttribute("role")!=="tab")return;
    const buttons=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const index=buttons.indexOf(target as HTMLButtonElement);
    const direction=locale === "ar" ? -1 : 1;
    let next:number;
    if(event.key === "ArrowRight")next=(index+direction+buttons.length)%buttons.length;
    else if(event.key === "ArrowLeft")next=(index-direction+buttons.length)%buttons.length;
    else if(event.key === "Home")next=0;
    else if(event.key === "End")next=buttons.length-1;
    else if(event.key === "Delete") {event.preventDefault();buttons[index+1]?.focus(); if(!buttons[index+1])buttons[index-1]?.focus();onClose(target.dataset.tabId!);return;}
    else return;
    event.preventDefault();buttons[next]?.focus();buttons[next]?.scrollIntoView?.({block:"nearest",inline:"nearest"});
  }}>
    {tabs.map(tab=><TabItem key={tab.id} tab={tab} active={tab.id===activeId} locale={locale} t={t} onSelect={onSelect} onClose={onClose} showingBrowser={showingBrowser}/>)}
    {!tabs.length && <span className="preview-tab"><Globe2 size={14}/>{t("newTabLabel")}</span>}
    <IconButton label={t("newTab")} onClick={onNew}><Plus size={17}/></IconButton>
  </div>;
});
