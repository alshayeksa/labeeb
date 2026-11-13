import { useEffect, useRef } from "react";
export interface VideoOfferData {url:string; kind:"youtube" | "direct"; tabId:string}
export default function VideoOffer({offer, ar, busy, close, download}: {
  offer:VideoOfferData; ar:boolean; busy:boolean; close:()=>void; download:(quality:string)=>void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget && !busy) close();}}>
    <div ref={panel} className="modal" role="dialog" aria-modal="true" aria-labelledby="video-offer-title" onKeyDown={e=>{
      if(e.key === "Escape" && !busy) close();
      if(e.key === "Tab") {
        const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const next = (buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        e.preventDefault(); buttons[next]?.focus();
      }
    }}>
      <h2 id="video-offer-title">{ar ? "تحميل هذا الفيديو" : "Download this video"}</h2>
      <p dir="ltr">{new URL(offer.url).hostname}</p>
      <p>{ar ? "اختر الصيغة وسيبدأ التحميل في الخلفية وتعود للفيديو." : "Choose a format to download in the background and return to your video."}</p>
      <div className="button-row">
        {offer.kind === "youtube" ? <>
          <button className="button primary" disabled={busy} onClick={()=>download("720")}>720p</button>
          <button className="button" disabled={busy} onClick={()=>download("1080")}>1080p</button>
          <button className="button" disabled={busy} onClick={()=>download("audio")}>{ar ? "صوت فقط" : "Audio only"}</button>
        </> : <button className="button primary" disabled={busy} onClick={()=>download("direct")}>{ar ? "تحميل الفيديو" : "Download video"}</button>}
        <button className="button" disabled={busy} onClick={close}>{ar ? "إغلاق" : "Close"}</button>
      </div>
    </div>
  </div>;
}
