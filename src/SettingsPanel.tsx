import { useState } from "react";
import {
  BookOpen,
  Check,
  KeyRound,
  Languages,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { BrowserModel } from "./useBrowser";
import { version } from "../package.json";
import { Moon, Sun, Monitor } from "lucide-react";
import type { ThemeModel } from "./theme";
export default function SettingsPanel({ model: m, theme }: { model: BrowserModel; theme: ThemeModel }) {
  const [secret, setSecret] = useState("");
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
            if (await m.run("ai_key_save", { key: secret }, m.t("keySaved")))
              setSecret("");
          }}
        >
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
            onClick={() => void m.queue("ai_key_delete")}
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
      <section className="settings-card">
        <div className="setting-title">
          <BookOpen size={20} />
          <h2>{m.t("about")}</h2>
        </div>
        <p>{m.t("aboutDetail")}</p>
        <button className="button subtle" onClick={() => m.setSection("about")}>
          {m.t("about")}
        </button>
        <small>
          {m.t("version")} {version} · {m.t("buildLabel")}
        </small>
      </section>
    </div>
  );
}
