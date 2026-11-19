import { useEffect, useRef, useState } from "react";
import { command } from "./bridge";
import { KeyRound, Trash2 } from "./icons";
import ConfirmDialog from "./ConfirmDialog";

interface Entry { id: string; origin: string; username: string }
function message(error: unknown, ar: boolean) {
  const code = String(error);
  if (code.includes("VAULT_AUTH_CANCELLED")) return ar ? "أُلغي التحقق؛ لم تُكشف كلمة المرور ولم تُحذف." : "Verification cancelled; no password was revealed or deleted.";
  if (code.includes("VAULT_AUTH_UNAVAILABLE")) return ar ? "يتطلب هذا الإجراء Windows 11 مع إعداد Windows Hello أو رمز PIN في إعدادات تسجيل الدخول في Windows." : "This requires Windows 11 with Windows Hello or a PIN configured in Windows sign-in settings.";
  if (code.includes("VAULT_DUPLICATE")) return ar ? "يوجد سجل لهذا الموقع واسم المستخدم بالفعل." : "An entry already exists for this site and username.";
  if (code.includes("VAULT_INVALID_SITE")) return ar ? "أدخل رابط موقع يبدأ بـ https:// دون بيانات دخول ضمن الرابط." : "Enter an https:// site URL without embedded login details.";
  if (code.includes("VAULT_INVALID_INPUT")) return ar ? "تحقق من اسم المستخدم وكلمة المرور وطولهما." : "Check the username, password and their lengths.";
  if (code.includes("VAULT_BUSY")) return ar ? "أكمل التحقق الجاري أولًا." : "Finish the current verification first.";
  return ar ? "تعذّر إكمال العملية في خزنة Windows. حاول مرة أخرى." : "The Windows vault operation could not be completed. Try again.";
}

export default function PasswordVault({ ar, enabled }: { ar: boolean; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false), [unlockError, setUnlockError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function toggle() {
    if (open) { setOpen(false); return; }
    setUnlocking(true); setUnlockError("");
    try { await command("vault_unlock", { ar }); if (mounted.current) setOpen(true); }
    catch (error) { if (mounted.current) setUnlockError(message(error, ar)); }
    finally { if (mounted.current) setUnlocking(false); }
  }
  return <section className="settings-card">
    <div className="setting-title"><KeyRound size={20}/><h2>{ar ? "خزنة كلمات المرور" : "Password vault"}</h2></div>
    <p>{ar ? "تُحفظ كلمات المرور في مخزن بيانات اعتماد Windows. يُطلب التحقق عند أول فتح للخزنة فقط، ويظل فتحها متاحًا حتى إغلاق لبيب." : "Passwords are stored in Windows Credential Manager. Verify once when you first open the vault; it stays unlocked until you close Labeeb."}</p>
    <p className="field-hint">{ar ? "استخدم زر المفتاح بجانب شريط العنوان لتعبئة حساب الموقع المطابق. لا تُستورد كلمات WebView2 السابقة تلقائيًا. مسح بيانات التصفح لا يحذف الخزنة." : "Use the key button beside the address bar to fill an account for the matching site. Existing WebView2 passwords are not imported automatically. Clearing browsing data does not delete this vault."}</p>
    <button className="button" disabled={!enabled || unlocking} aria-expanded={open} onClick={() => void toggle()}>{unlocking ? (ar ? "جارٍ التحقق…" : "Verifying…") : open ? (ar ? "إغلاق الخزنة" : "Close vault") : (ar ? "إدارة كلمات المرور" : "Manage passwords")}</button>
    {unlockError && <p role="status">{unlockError}</p>}
    {open && <VaultContents ar={ar}/>}
  </section>;
}

function VaultContents({ ar }: { ar: boolean }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [site, setSite] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState<{ id: string; text: string } | null>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let current = true;
    void Promise.all([command<boolean>("vault_status"), command<Entry[]>("vault_list")]).then(([ok, rows]) => {
      if (!current) return;
      setAvailable(ok); setEntries(rows);
      if (!ok) setNotice(message("VAULT_AUTH_UNAVAILABLE", ar));
    }).catch(error => { if (current) setNotice(message(error, ar)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; alive.current = false; };
  }, [ar]);
  useEffect(() => {
    const hide = () => setRevealed(null);
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", hide);
    return () => { window.removeEventListener("blur", hide); document.removeEventListener("visibilitychange", hide); };
  }, []);
  useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => setRevealed(null), 20_000);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setNotice(""); setRevealed(null);
    try { await action(); }
    catch (error) { if (alive.current) setNotice(message(error, ar)); }
    finally { if (alive.current) setBusy(false); }
  }
  async function reload() {
    const rows = await command<Entry[]>("vault_list");
    if (alive.current) setEntries(rows);
  }
  return <div className="password-vault" aria-busy={busy}>
    <p className="field-hint">{ar ? "الخزنة مفتوحة لهذه الجلسة. تُخفى كلمة المرور المعروضة بعد 20 ثانية أو عند مغادرة النافذة." : "The vault is unlocked for this session. Displayed passwords hide after 20 seconds or when the window loses focus."}</p>
    {notice && <p role="status">{notice}</p>}
    <form className="vault-form" onSubmit={event => {
      event.preventDefault();
      void perform(async () => {
        await command("vault_add", { site, username, password });
        if (!alive.current) return;
        setPassword(""); setUsername(""); setSite("");
        setNotice(ar ? "حُفظت كلمة المرور في الخزنة." : "Password saved in the vault.");
        await reload();
      });
    }}>
      <label>{ar ? "الموقع (https://)" : "Website (https://)"}<input type="url" dir="ltr" required maxLength={2048} placeholder="https://example.com" value={site} disabled={busy || !available} onChange={e => setSite(e.target.value)}/></label>
      <label>{ar ? "اسم المستخدم" : "Username"}<input dir="auto" required maxLength={512} autoComplete="off" value={username} disabled={busy || !available} onChange={e => setUsername(e.target.value)}/></label>
      <label>{ar ? "كلمة المرور" : "Password"}<input type="password" dir="ltr" required maxLength={1024} autoComplete="new-password" value={password} disabled={busy || !available} onChange={e => setPassword(e.target.value)}/></label>
      <button className="button primary" disabled={busy || !available}>{ar ? "إضافة إلى الخزنة" : "Add to vault"}</button>
    </form>
    {!busy && entries.length === 0 && <p>{ar ? "لا توجد كلمات مرور في الخزنة بعد." : "No passwords in the vault yet."}</p>}
    <ul className="vault-list">{entries.map(entry => <li key={entry.id}>
      <div className="vault-account"><strong dir="ltr">{entry.origin}</strong><span dir="auto">{entry.username}</span>
        <span className="vault-secret" dir="ltr" aria-label={ar ? "كلمة المرور المحفوظة" : "Saved password"}>{revealed?.id === entry.id ? revealed.text : "••••••••"}</span>
      </div>
      <div className="button-row">
        <button className="button" disabled={busy || !available} aria-label={`${revealed?.id === entry.id ? (ar ? "إخفاء" : "Hide") : (ar ? "عرض" : "Show")} ${entry.username} — ${entry.origin}`} onClick={() => {
          if (revealed?.id === entry.id) { setRevealed(null); return; }
          void perform(async () => {
            const text = await command<string>("vault_reveal", { id: entry.id, ar });
            if (alive.current && !document.hidden && document.hasFocus()) setRevealed({ id: entry.id, text });
          });
        }}>{revealed?.id === entry.id ? (ar ? "إخفاء" : "Hide") : (ar ? "عرض" : "Show")}</button>
        <button className="button danger" disabled={busy || !available} aria-label={`${ar ? "حذف" : "Delete"} ${entry.username} — ${entry.origin}`} onClick={() => { setRevealed(null); setDeleting(entry); }}><Trash2 size={16}/>{ar ? "حذف" : "Delete"}</button>
      </div>
    </li>)}</ul>
    {deleting && <ConfirmDialog title={ar ? "حذف كلمة المرور؟" : "Delete password?"} itemName={`${deleting.origin} — ${deleting.username}`} detail={ar ? "سيُحذف هذا السجل من خزنة لبيب نهائيًا." : "This entry will be permanently removed from Labeeb’s vault."} confirmLabel={ar ? "حذف كلمة المرور" : "Delete password"} cancelLabel={ar ? "إلغاء" : "Cancel"} busy={busy} onCancel={() => setDeleting(null)} onConfirm={() => {
      const id = deleting.id;
      setDeleting(null);
      void perform(async () => { await command("vault_delete", { id, ar }); if (alive.current) { setNotice(ar ? "حُذف السجل." : "Entry deleted."); await reload(); } });
    }}/ >}
  </div>;
}
