import { memo, useEffect, useRef, useState } from "react";
import type React from "react";
import { useFavicon } from "./favicon";
import { Globe2, LoaderCircle, Plus, X } from "./icons";
import { IconButton } from "./components";
import type { Tab } from "./bridge";
import type { Locale, TranslationKey } from "./i18n";
interface Props {
  tabs: Tab[]; activeId: string | null; locale: Locale;
  t: (key: TranslationKey) => string;
  onSelect: (id: string) => void; onClose: (id: string) => void; onNew: () => void;
  /** Moves a tab to `index` in the strip. Without it tabs cannot be reordered. */
  onMove?: (id: string, index: number) => void;
  showingBrowser: boolean;
}
/** A tab being dragged: where it started, how far it has gone, and where it would land. */
interface Drag { id: string; from: number; to: number; dx: number; width: number; }
const TabItem = memo(function TabItem({tab, active, locale, t, onSelect, onClose, showingBrowser, shift, moving, onGrab}: Omit<Props,"tabs"|"activeId"|"onNew"|"onMove"> & {tab:Tab;active:boolean;shift:number;moving:boolean;onGrab?:(event:React.PointerEvent<HTMLDivElement>,id:string)=>void}) {
  const title = !tab.title || tab.title === "New tab" ? t("newTabLabel") : tab.title;
  const favicon = useFavicon(tab.icon);
  // An icon the engine cannot draw falls back to the globe.
  const [broken, setBroken] = useState<string>();
  return <div role="presentation" className={`tab ${active ? "active" : ""}${moving ? " moving" : ""}`} data-tab={tab.id}
    style={shift ? {transform:`translateX(${shift}px)`} : undefined}
    onPointerDown={onGrab && (event=>onGrab(event, tab.id))}
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
export default memo(function TabStrip({tabs,activeId,locale,t,onSelect,onClose,onNew,onMove,showingBrowser}: Props) {
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The order just chosen, shown until the native side reports it back.
  const [placed, setPlaced] = useState<string[] | null>(null);
  const swallowClick = useRef(false);
  const stopDrag = useRef<(() => void) | undefined>(undefined);
  useEffect(()=>{
    const selected = list.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    selected?.scrollIntoView?.({block:"nearest",inline:"nearest"});
  },[activeId]);
  useEffect(() => {
    if (!placed) return;
    const same = placed.length === tabs.length && tabs.every(tab => placed.includes(tab.id));
    if (!same || tabs.every((tab, index) => tab.id === placed[index])) { setPlaced(null); return; }
    const timer = setTimeout(() => setPlaced(null), 1500);
    return () => clearTimeout(timer);
  }, [placed, tabs]);
  useEffect(() => () => stopDrag.current?.(), []);
  const shown = placed ? placed.map(id => tabs.find(tab => tab.id === id)).filter((tab): tab is Tab => !!tab) : tabs;
  const move = (id: string, index: number) => {
    const order = shown.map(tab => tab.id).filter(other => other !== id);
    order.splice(index, 0, id);
    setPlaced(order);
    onMove?.(id, index);
  };
  const grab = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0 || shown.length < 2 || (event.target as HTMLElement).closest(".tab-close")) return;
    swallowClick.current = false;
    const items = Array.from(list.current?.querySelectorAll<HTMLElement>(".tab") ?? []);
    const from = items.findIndex(item => item.dataset.tab === id);
    if (from < 0) return;
    const boxes = items.map(item => item.getBoundingClientRect());
    const own = boxes[from], startX = event.clientX, forward = locale === "ar" ? -1 : 1;
    const low = Math.min(...boxes.map(box => box.left)) - own.left, high = Math.max(...boxes.map(box => box.right)) - own.right;
    const element = event.currentTarget, pointer = event.pointerId;
    let current: Drag | null = null;
    const follow = (moved: PointerEvent) => {
      if (!current) {
        if (Math.abs(moved.clientX - startX) < 6) return;
        // Keep receiving the pointer when it leaves the strip or the window.
        try { element.setPointerCapture?.(pointer); } catch { /* The pointer is already gone. */ }
      }
      const dx = Math.min(high, Math.max(low, moved.clientX - startX));
      // The landing place follows the pointer itself, so the ends of the strip stay reachable.
      const centre = own.left + own.width / 2 + moved.clientX - startX;
      // The tab lands after every neighbour whose middle it has passed.
      const to = boxes.filter((box, index) => index !== from && (box.left + box.width / 2 - centre) * forward < 0).length;
      current = {id, from, to, dx, width: own.width};
      swallowClick.current = true;
      setDrag(current);
    };
    const finish = (ended?: PointerEvent) => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      stopDrag.current = undefined;
      const done = current;
      current = null;
      setDrag(null);
      if (done && ended?.type === "pointerup" && done.to !== done.from) move(id, done.to);
    };
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    stopDrag.current = () => finish();
  };
  const shiftOf = (index: number, id: string) => {
    if (!drag) return 0;
    if (id === drag.id) return drag.dx;
    const forward = locale === "ar" ? -1 : 1;
    if (index > drag.from && index <= drag.to) return -drag.width * forward;
    if (index < drag.from && index >= drag.to) return drag.width * forward;
    return 0;
  };
  return <div ref={list} className={`tab-strip${drag ? " reordering" : ""}`} role="tablist" aria-label={t("tabs")}
    onClickCapture={event=>{ if(swallowClick.current){ swallowClick.current=false; event.preventDefault(); event.stopPropagation(); } }}
    onKeyDown={event=>{
    const target=event.target as HTMLElement;
    if(target.getAttribute("role")!=="tab" || event.nativeEvent.isComposing)return;
    const buttons=Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const index=buttons.indexOf(target as HTMLButtonElement);
    // Ctrl+Shift+PageUp/PageDown moves the focused tab, as in other browsers.
    if((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && (event.key === "PageUp" || event.key === "PageDown")) {
      const to=index+(event.key === "PageUp" ? -1 : 1);
      event.preventDefault();
      if(onMove && to>=0 && to<buttons.length) move(target.dataset.tabId!, to);
      return;
    }
    if(event.altKey || event.ctrlKey || event.metaKey) return;
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
    {shown.map((tab,index)=><TabItem key={tab.id} tab={tab} active={tab.id===activeId} locale={locale} t={t} onSelect={onSelect} onClose={onClose} showingBrowser={showingBrowser}
      shift={shiftOf(index, tab.id)} moving={drag?.id===tab.id} onGrab={onMove ? grab : undefined}/>)}
    {!tabs.length && <span className="preview-tab"><Globe2 size={14}/>{t("newTabLabel")}</span>}
    <IconButton label={t("newTab")} onClick={onNew}><Plus size={17}/></IconButton>
  </div>;
});
