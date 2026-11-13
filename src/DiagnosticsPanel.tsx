import { useEffect, useState } from "react";
import { command } from "./bridge";
type Event = { time: number; session: string; event: string; tab: string; details: {origin?: string; navigationId?: string; success?: boolean; webErrorStatus?: number; httpStatus?: number; durationMs?: number} };
type Log = {path: string; error: string | null; events: Event[]};
export default function DiagnosticsPanel({locale}: {locale: string}) {
  const ar = locale === "ar";
  const [log, setLog] = useState<Log>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try { const value = await command<Log>("diagnostics_snapshot"); if (active) { setLog(value); setError(""); } }
      catch { if (active) setError(ar ? "تعذر قراءة السجل" : "Cannot read diagnostics"); }
    };
    void refresh(); const timer = window.setInterval(refresh, 2000);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [ar]);
  return <div className="content-page diagnostics-page">
    <h1>{ar ? "سجل التشخيص" : "Diagnostics"}</h1>
    <p>{ar ? "تسجيل محلي تلقائي لتحميل المواقع والتحويلات والأخطاء. يُحفظ اسم النطاق فقط دون مسار الصفحة أو كلمات المرور أو الكوكيز أو محتوى الصفحات. آخر 500 حدث، وملفان بحد يقارب 1 ميجابايت لكل ملف." : "Automatic local navigation, redirect and error logging. Only site origins are recorded, without paths, passwords, cookies or page content. Latest 500 events; two files of about 1 MB each."}</p>
    <p>{ar ? "رمز 13 يعني تعذر حل اسم النطاق (DNS)، ورمز 14 يعني إلغاء التحميل. نجاح طلب لاحق لا يمحو الخطأ السابق. لا يشمل السجل طلبات الصور والملفات الفرعية." : "Code 13 means DNS resolution failed; code 14 means navigation was canceled. Later success preserves previous failures. Subresource requests are not included."}</p>
    {log && <p dir="ltr" className="diagnostics-path">{log.path}</p>}
    {(error || log?.error) && <p role="alert">{error || log?.error}</p>}
    {!log && !error && <p>{ar ? "جارٍ قراءة السجل…" : "Loading…"}</p>}
    <div className="diagnostics-events">{log?.events.map((event, index) => <article key={`${event.session}-${event.time}-${index}`} className={event.details.success === false ? "diagnostic-failed" : ""}>
      <strong>{event.event === "navigation_completed" ? (event.details.success ? (ar ? "اكتمل التحميل" : "Loaded") : (ar ? "لم يكتمل التحميل" : "Navigation failed")) : event.event}</strong>
      <time>{new Date(event.time).toLocaleString(ar ? "ar-SA" : "en-US")}</time>
      <pre dir="ltr">{JSON.stringify({tab:event.tab, session:event.session, ...event.details}, null, 2)}</pre>
    </article>)}</div>
  </div>;
}
