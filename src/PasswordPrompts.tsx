import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { command } from "./bridge";
import { KeyRound } from "./icons";
interface Offer { id: string; tab: string; origin: string; username: string }
interface Choices { tab: string; url: string; entries: { id: string; origin: string; username: string }[] }
function errorText(error: unknown, ar: boolean) {
  const value = String(error);
  if (value.includes("VAULT_AUTH_CANCELLED")) return ar ? "أُلغي التحقق. لم تُحفظ أو تُعبّأ كلمة المرور." : "Verification cancelled. No password was saved or filled.";
  if (value.includes("VAULT_AUTH_UNAVAILABLE")) return ar ? "أعدّ Windows Hello أو PIN في إعدادات Windows 11 أولًا." : "Set up Windows Hello or a PIN in Windows 11 first.";
  if (value.includes("VAULT_FILL_FAILED")) return ar ? "لم أجد نموذج دخول مدعومًا. افتح النموذج وحاول مجددًا؛ لم يُرسل أي نموذج." : "No supported login form was found. Open the form and retry; no form was submitted.";
  if (value.includes("VAULT_EXPIRED") || value.includes("VAULT_PAGE_CHANGED")) return ar ? "انتهى الطلب أو تغيّر التبويب. حاول من الصفحة المطلوبة مجددًا." : "The request expired or the tab changed. Try again on the intended page.";
  return ar ? "تعذّرت العملية. حاول مجددًا من الصفحة المطلوبة." : "The operation failed. Try again on the intended page.";
}
export default function PasswordPrompts({ ar, native, activeTab, fillTab, closeFill, onOpenChange, onOfferChange, notify }: {
  ar: boolean; native: boolean; activeTab: string | null; fillTab: string | null; closeFill: () => void;
  onOfferChange?: (open: boolean) => void;
  onOpenChange: (open: boolean) => void; notify: (message: string, error?: boolean) => void;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null), currentOffer = useRef(offer); currentOffer.current = offer;
  const open = !!offer || !!fillTab;
  useEffect(() => { onOpenChange(!!fillTab); return () => onOpenChange(false); }, [fillTab, onOpenChange]);
  useEffect(() => { onOfferChange?.(!!offer); return () => onOfferChange?.(false); }, [offer, onOfferChange]);
  useEffect(() => {
    if (!native) return;
    let disposed = false; const stops: (() => void)[] = [];
    const add = (promise: Promise<() => void>) => void promise.then(stop => disposed ? stop() : stops.push(stop)).catch(() => {});
    add(listen<Offer>("password-offer", event => { setError(""); setOffer(event.payload); }));
    add(listen<string>("password-offer-expired", event => setOffer(value => value?.id === event.payload ? null : value)));
    add(listen("password-offer-cancelled", () => setOffer(null)));
    return () => { disposed = true; stops.forEach(stop => stop()); if (currentOffer.current) void command("password_offer_dismiss", { id: currentOffer.current.id }).catch(() => {}); };
  }, [native]);
  useEffect(() => {
    if (offer && offer.tab !== activeTab) { void command("password_offer_dismiss", { id: offer.id }).catch(() => {}); setOffer(null); }
    if (fillTab && fillTab !== activeTab) closeFill();
  }, [activeTab, offer, fillTab, closeFill]);
  useEffect(() => {
    if (!fillTab) { setChoices(null); return; }
    let current = true; setLoading(true); setError("");
    void command<Choices>("password_fill_choices", { tab: fillTab }).then(value => { if (current && value) setChoices(value); }).catch(e => { if (current) setError(errorText(e, ar)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [fillTab, ar]);
  useEffect(() => {
    if (!fillTab) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLButtonElement>('button[data-cancel]')?.focus();
    return () => previous?.focus?.();
  }, [fillTab]);
  if (!open) return null;
  const close = () => {
    if (busy) return;
    if (offer) void command("password_offer_dismiss", { id: offer.id }).catch(() => {});
    setOffer(null); closeFill(); setError("");
  };
  async function save() {
    if (!offer || busy) return;
    setBusy(true); setError("");
    try { await command("password_offer_save", { id: offer.id, ar }); notify(ar ? "حُفظت كلمة المرور في خزنة لبيب." : "Password saved in Labeeb’s vault."); }
    catch (e) { notify(errorText(e, ar), true); }
    finally { setOffer(null); setBusy(false); }
  }
  async function fill(id: string) {
    if (!choices || busy) return;
    setBusy(true); setError("");
    try {
      await command("password_fill", { tab: choices.tab, url: choices.url, id, ar });
      notify(ar ? "عُبّئت بيانات الدخول. راجعها واضغط تسجيل الدخول بنفسك." : "Login fields filled. Review them and sign in yourself."); closeFill();
    } catch (e) { setError(errorText(e, ar)); } finally { setBusy(false); }
  }
  if (offer && !fillTab) return <section className="password-save-notice" role="region" aria-label={ar ? "حفظ كلمة المرور" : "Save password"} dir={ar ? "rtl" : "ltr"} onKeyDown={event => { if (event.key === "Escape") close(); }}>
    <KeyRound size={20} aria-hidden="true"/>
    <div className="password-save-summary" aria-live="polite">
      <strong>{ar ? "حفظ كلمة المرور؟" : "Save password?"}</strong>
      <span dir="ltr">{offer.origin}</span><span dir="auto">{offer.username}</span>
    </div>
    <div className="button-row">
      <button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? (ar ? "جارٍ الحفظ…" : "Saving…") : (ar ? "حفظ" : "Save")}</button>
      <button className="button" disabled={busy} onClick={close}>{ar ? "ليس الآن" : "Not now"}</button>
    </div>
  </section>;
  return <div className="modal-backdrop"><div ref={panel} className="modal password-prompt" role="dialog" aria-modal="true" aria-labelledby="password-prompt-title" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const buttons = Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      if (!buttons.length) return;
      event.preventDefault(); buttons[(buttons.indexOf(document.activeElement as HTMLButtonElement) + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    <KeyRound size={24}/><h2 id="password-prompt-title">{ar ? "\u062a\u0639\u0628\u0626\u0629 \u0645\u0646 \u062e\u0632\u0646\u0629 \u0644\u0628\u064a\u0628" : "Fill from Labeeb's vault"}</h2>
      {loading && <p role="status">{ar ? "جارٍ قراءة حسابات الموقع…" : "Loading site accounts…"}</p>}
      {choices && <p dir="ltr">{new URL(choices.url).origin}</p>}
      {!loading && choices?.entries.length === 0 && <p>{ar ? "لا توجد حسابات لهذا الموقع في خزنة لبيب." : "No accounts for this site in Labeeb’s vault."}</p>}
      <p>{ar ? "اختر الحساب لتعبئة النموذج. لن يُرسل النموذج تلقائيًا." : "Choose an account to fill the form. It will not be submitted automatically."}</p>
      {choices?.entries.map(entry => <button key={entry.id} className="button" disabled={busy} onClick={() => void fill(entry.id)}>{entry.username}</button>)}
    {error && <p role="alert">{error}</p>}
    <button className="button" data-cancel disabled={busy} onClick={close}>{ar ? "ليس الآن" : "Not now"}</button>
  </div></div>;
}
