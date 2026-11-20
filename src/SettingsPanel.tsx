import { useState } from "react";
import PasswordVault from "./PasswordVault";
import AiProviderPicker, { aiDefaults, providerName } from "./AiProviderPicker";
import {
  Check,
  KeyRound,
  Languages,
  ShieldCheck,
  Trash2,
} from "./icons";
import type { BrowserModel } from "./useBrowser";
import { readSearchEngine, saveSearchEngine, searchEngines } from "./bridge";
import type { SearchEngine } from "./bridge";
import { vioraSupported } from "./viora";
import { Clapperboard, Search } from "./icons";
import { Moon, Sun, Monitor } from "./icons";
import type { ThemeModel } from "./theme";
export default function SettingsPanel({ model: m, theme }: { model: BrowserModel; theme: ThemeModel }) {
  const [secret, setSecret] = useState("");
  const [provider, setProvider] = useState(m.snapshot.settings.aiProvider ?? "openai");
  const [aiModel, setAiModel] = useState(m.snapshot.settings.aiConnection?.model ?? aiDefaults[provider]);
  const [endpoint, setEndpoint] = useState(m.snapshot.settings.aiConnection?.provider === "custom" ? m.snapshot.settings.aiConnection.endpoint : "");
  const [protocol, setProtocol] = useState<"openai" | "anthropic">(m.snapshot.settings.aiConnection?.protocol ?? "openai");
  const [workspace, setWorkspace] = useState(m.snapshot.settings.aiConnection?.workspace ?? "");
  const [engine, setEngine] = useState<SearchEngine>(readSearchEngine);
  const [confirmSiteData, setConfirmSiteData] = useState(false);
  const ar = m.locale === "ar";
  const clearSiteData = async () => {
    setConfirmSiteData(false);
    // The shell's own preferences live in the same engine profile; keep them.
    const keep: [string, string][] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key) keep.push([key, localStorage.getItem(key) ?? ""]); } } catch { /* Nothing to keep. */ }
    const restore = () => { try { keep.forEach(([key, value]) => localStorage.setItem(key, value)); } catch { /* Preferences fall back to defaults. */ } };
    if (await m.run("site_data_clear", undefined, ar ? "مُسحت ملفات الارتباط وبيانات المواقع. ستحتاج إلى تسجيل الدخول من جديد." : "Cookies and site data were cleared. You will need to sign in again.")) {
      restore(); setTimeout(restore, 2500);
    }
  };
  return (
    <div className="content-page settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{m.t("privacy")}</p>
          <h1>{m.t("settings")}</h1>
        </div>
      </div>
      <section className="settings-card">
        <div className="setting-title"><Sun size={20}/><h2>{m.locale === "ar" ? "المظهر" : "Appearance"}</h2></div>
        <div className="theme-options" role="group" aria-label={m.locale === "ar" ? "مظهر المتصفح" : "Browser appearance"}>
          {([{value:"light", ar:"نهاري", en:"Light", Icon:Sun}, {value:"dark", ar:"ليلي", en:"Dark", Icon:Moon}, {value:"system", ar:"حسب النظام", en:"System", Icon:Monitor}] as const).map(({value, ar, en, Icon}) =>
            <button key={value} type="button" className={`button ${theme.preference === value ? "primary" : ""}`} aria-pressed={theme.preference === value} onClick={() => theme.change(value)}>
              <Icon size={18}/>{m.locale === "ar" ? ar : en}{theme.preference === value && <Check size={15}/>}
            </button>)}
        </div>
        <p className="field-hint">{m.locale === "ar" ? "يُحفظ اختيارك تلقائيًا لواجهة لبيب. مظهر المواقع تحدده إعداداتها الخاصة." : "Your choice is saved for Labeeb’s interface. Websites control their own appearance."}</p>
      </section>
      <section className="settings-card">
        <div className="setting-title">
          <Languages size={20} />
          <h2>{m.t("language")}</h2>
        </div>
        <div className="language-options">
          {(["ar", "en"] as const).map((locale) => (
            <button
              key={locale}
              className={`button ${m.locale === locale ? "primary" : ""}`}
              onClick={() => void m.switchLocale(locale)}
            >
              {m.t(locale === "ar" ? "arabic" : "english")}
              {m.locale === locale && <Check size={15} />}
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <div className="setting-title"><Search size={20}/><h2>{ar ? "محرك البحث" : "Search engine"}</h2></div>
        <div className="language-options" role="group" aria-label={ar ? "محرك البحث في شريط العنوان" : "Address bar search engine"}>
          {(Object.keys(searchEngines) as SearchEngine[]).map(value =>
            <button key={value} type="button" className={`button ${engine === value ? "primary" : ""}`} aria-pressed={engine === value} onClick={() => { saveSearchEngine(value); setEngine(value); }}>
              {searchEngines[value].name}{engine === value && <Check size={15}/>}
            </button>)}
        </div>
        <p className="field-hint">{ar ? "يُستخدم عند كتابة عبارة بحث في شريط العنوان بدل رابط." : "Used when you type a search phrase in the address bar instead of a link."}</p>
      </section>
      {vioraSupported(m) && <section className="settings-card">
        <div className="setting-title"><Clapperboard size={20}/><h2>Viora</h2></div>
        <p>{ar ? "Viora برنامج مستقل لمشاهدة يوتيوب بلا إعلانات. يشغّله لبيب من زر Viora في القائمة الجانبية، ومن زر «بلا إعلانات» عند فتح فيديو يوتيوب." : "Viora is a separate program for watching YouTube without ads. Labeeb starts it from the Viora sidebar button and from the “Ad-free” button on YouTube videos."}</p>
        <p className="field-hint" dir="auto">{m.snapshot.settings.vioraPath ? `${ar ? "المكان المحدد" : "Selected location"}: ${m.snapshot.settings.vioraPath}` : (ar ? "لم يُحدَّد مكان Viora بعد؛ سيُطلب منك عند أول استخدام إن لم يُعثر عليه تلقائيًا." : "No location selected yet; you will be asked on first use if it is not found automatically.")}</p>
        <button className="button" disabled={m.busy || !m.isNative} onClick={() => void m.run("viora_choose")}>{ar ? "تحديد مكان Viora.exe" : "Choose Viora.exe"}</button>
      </section>}
      {m.snapshot.settings.passwordSaveSupported && <section className="settings-card">
        <div className="setting-title"><KeyRound size={20}/><h2>{ar ? "كلمات مرور المواقع" : "Website passwords"}</h2></div>
        <p>{ar ? "يسأل لبيب عن حفظ بيانات الدخول في خزنته عند إرسال نموذج دخول مدعوم. الحفظ يتم بعد موافقتك والتحقق من هويتك؛ لا تُرسل الكلمات إلى المساعد. للتعبئة، استخدم زر المفتاح بجانب شريط العنوان." : "Labeeb offers to save supported login forms in its vault after your approval and identity verification. Passwords are not sent to the assistant. Use the key button beside the address bar to fill a login."}</p>
        <button type="button" className={`button ${m.snapshot.settings.passwordSave ? "primary" : ""}`} role="switch" aria-label={ar ? "السماح بحفظ كلمات المرور" : "Allow saving passwords"} aria-checked={!!m.snapshot.settings.passwordSave} disabled={m.busy || !m.isNative}
          onClick={() => void m.run("settings_update", { locale: m.locale, passwordSave: !m.snapshot.settings.passwordSave },
            m.snapshot.settings.passwordSave
              ? (ar ? "تم إيقاف السماح بحفظ كلمات المرور." : "Password saving has been disabled.")
              : (ar ? "تم تفعيل السماح بحفظ كلمات المرور." : "Password saving has been enabled."))}>
          {m.snapshot.settings.passwordSave && <Check size={16} aria-hidden="true" />}
          {ar ? "السماح بحفظ كلمات المرور" : "Allow saving passwords"}
          <span aria-hidden="true"> — {m.snapshot.settings.passwordSave ? (ar ? "مفعّل" : "Enabled") : (ar ? "غير مفعّل" : "Disabled")}</span>
        </button>
        <p className="field-hint">{ar ? "هذا الخيار خاص بلبيب: إيقافه يمنع طلبات الحفظ الجديدة ولا يحذف الخزنة أو يمنع التعبئة التي تطلبها. الحفظ الجديد في WebView2 معطّل دائمًا. كلماته القديمة قد تبقى قابلة للتعبئة، ولا يحذفها حذف سجل من خزنة لبيب؛ مسح بيانات التصفح أدناه يزيلها مع بيانات المواقع." : "This controls Labeeb only: turning it off stops save offers without deleting the vault or disabling filling you request. New WebView2 password saving is always disabled. Its older passwords may still autofill and are not deleted by removing a Labeeb vault entry; clearing browsing data below removes them together with site data."}</p>
      </section>}
      {m.snapshot.settings.passwordSaveSupported && <PasswordVault ar={ar} enabled={m.isNative}/>}
      <section className="settings-card">
        <div className="setting-title"><Trash2 size={20}/><h2>{ar ? "بيانات التصفح" : "Browsing data"}</h2></div>
        <p>{ar ? "يمسح ملفات الارتباط وبيانات المواقع والملفات المؤقتة وكلمات المرور القديمة في WebView2، فتخرج من حساباتك. تبقى خزنة لبيب والسجل والمفضلة والتنزيلات." : "Removes cookies, site storage, cached files and legacy WebView2 passwords, signing you out. Labeeb’s vault, history, bookmarks and downloads are kept."}</p>
        {confirmSiteData ? (
          <div className="button-row">
            <button className="button danger" disabled={m.busy} onClick={() => void clearSiteData()}>{ar ? "نعم، امسح بيانات المواقع" : "Yes, clear site data"}</button>
            <button className="button" autoFocus onClick={() => setConfirmSiteData(false)}>{m.t("cancel")}</button>
          </div>
        ) : (
          <button className="button subtle danger" disabled={m.busy || !m.isNative} onClick={() => setConfirmSiteData(true)}><Trash2 size={15}/>{ar ? "مسح ملفات الارتباط وبيانات المواقع" : "Clear cookies and site data"}</button>
        )}
      </section>
      <section className="settings-card">
        <div className="setting-title"><Monitor size={20}/><h2>{m.locale === "ar" ? "السرعة وتوفير الموارد" : "Performance and resource use"}</h2></div>
        <p>{m.locale === "ar" ? "تُستعاد تبويباتك تلقائيًا؛ يُحمّل التبويب المحدد أولًا والبقية عند فتحها. تُخفّض أولوية الذاكرة للتبويبات غير الظاهرة على Windows، وتتوقف تحديثات الواجهة الدورية عند إخفائها." : "Your tabs are restored automatically. The selected tab loads first; other tabs load when opened. Hidden tabs use a lower memory target on Windows, and periodic interface updates stop while hidden."}</p>
        <p className="field-hint">{m.locale === "ar" ? "تبويبات مواقع محمّلة" : "Loaded website tabs"}: {m.snapshot.tabs.filter(t => !t.deferred && t.url !== "about:blank").length} · {m.locale === "ar" ? "مؤجلة التحميل" : "Waiting to load"}: {m.snapshot.tabs.filter(t => t.deferred && t.url !== "about:blank").length}</p>
      </section>
      <section className="settings-card">
        <div className="setting-title">
          <KeyRound size={20} />
          <h2>{m.t("aiSettings")}</h2>
          <span
            className={`status-pill ${m.snapshot.settings.aiConfigured ? "online" : ""}`}
          >
            {m.t(
              m.snapshot.settings.aiConfigured ? "configured" : "notConfigured",
            )}
          </span>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await m.run("ai_key_save", { key: secret, provider, model: aiModel, ...(provider === "custom" ? {endpoint, protocol} : {}), ...(provider === "claude" || (provider === "custom" && protocol === "anthropic") ? {workspace} : {}) }, m.t("keySaved")))
              setSecret("");
          }}
        >
          <AiProviderPicker ar={ar} value={provider} disabled={m.busy} onChange={value => { setProvider(value); setAiModel(aiDefaults[value]); setSecret(""); setWorkspace(""); setProtocol(value === "claude" ? "anthropic" : "openai"); }}/>
          <div className="ai-connection-fields">
            <label className="ai-connection-field">{ar ? "اسم النموذج" : "Model ID"}<input required dir="ltr" value={aiModel} maxLength={200} disabled={m.busy} onChange={event => { setAiModel(event.target.value); }} placeholder="model-id" spellCheck={false}/></label>
            {provider === "custom" && <>
              <fieldset className="ai-protocol"><legend>{ar ? "نوع الربط" : "API format"}</legend>{(["openai", "anthropic"] as const).map(value => <label key={value}><input type="radio" name="ai-protocol" checked={protocol === value} disabled={m.busy} onChange={() => { setProtocol(value); }}/>{value === "openai" ? "OpenAI Chat Completions" : "Anthropic Messages"}</label>)}</fieldset>
              <label className="ai-connection-field">{ar ? "عنوان API الكامل" : "Full API endpoint"}<input required type="url" dir="ltr" value={endpoint} maxLength={2048} disabled={m.busy} onChange={event => { setEndpoint(event.target.value); setSecret(""); }} placeholder={protocol === "openai" ? "https://api.example.com/v1/chat/completions" : "https://api.example.com/v1/messages"} spellCheck={false}/></label>
              <p className="field-hint">{ar ? "يُرسل المفتاح ورسائلك إلى هذا العنوان عند استخدام المساعد. أدخل عنوان الطلب الكامل، وليس الصفحة الرئيسية للخدمة. يُقبل HTTP للخدمات المحلية فقط." : "Your key and messages are sent to this endpoint when using the assistant. Enter the full request URL, not the service homepage. HTTP is supported only on localhost."}</p>
            </>}
            {(provider === "claude" || (provider === "custom" && protocol === "anthropic")) && <label className="ai-connection-field">{ar ? "معرّف مساحة العمل (اختياري)" : "Workspace ID (optional)"}<input dir="ltr" value={workspace} maxLength={200} disabled={m.busy} onChange={event => { setWorkspace(event.target.value); }} placeholder="wrkspc_…" spellCheck={false}/></label>}
          </div>
          <p className="field-hint">{ar ? "احفظ المفتاح لتفعيل الإعدادات المحددة." : "Save the key to activate these settings."}</p>
          {m.snapshot.settings.aiConfigured && <p className="field-hint">{ar ? "المزوّد المفعّل: " : "Active provider: "}{providerName(m.snapshot.settings.aiProvider ?? "openai", ar)}</p>}
          <label htmlFor="api-key" className="field-label">
            {m.t("apiKey")}
          </label>
          <div className="inline-input">
            <input
              id="api-key"
              type="password"
              maxLength={1024}
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              placeholder="••••••••••••••••"
            />
            <button
              className="button primary"
              disabled={m.busy || !secret.trim()}
            >
              {m.t("saveKey")}
            </button>
          </div>
          <p className="field-hint">{m.t("keyHint")}</p>
        </form>
        {m.snapshot.settings.aiConfigured && (
          <button
            className="button subtle danger"
            disabled={m.busy}
            onClick={() => void m.run("ai_key_delete", undefined, m.t("keyRemoved"))}
          >
            <Trash2 size={15} />
            {m.t("deleteKey")}
          </button>
        )}
      </section>
      <section className="settings-card">
        <div className="setting-title">
          <ShieldCheck size={20} />
          <h2>{m.t("permissions")}</h2>
        </div>
        <p>{m.t("permissionsDetail")}</p>
        <p>{m.t("localStorageDetail")}</p>
        <div className="security-tags">
          <span>
            <Check size={14} />
            SQLite
          </span>
          <span>
            <Check size={14} />
            {m.t("keyPrivate")}
          </span>
          <span>
            <Check size={14} />
            {m.t("remoteContent")}
          </span>
        </div>
      </section>
    </div>
  );
}
