import { useState } from "react";
import type { MouseEvent } from "react";
import AboutFeatures from "./AboutFeatures";
import { ArrowUpRight, Clapperboard, Globe2, MapPin } from "./icons";
import aboutArtwork from "./assets/labeeb-about.png";
import { version } from "../package.json";
import appLicense from "../LICENSE?raw";
import notices from "../THIRD_PARTY_NOTICES.md?raw";
import fontLicense from "../licenses/Tajawal-OFL.txt?raw";
import vioraLicense from "../licenses/Viora-AGPL-3.0.txt?raw";
import type { BrowserModel } from "./useBrowser";
import { openViora } from "./viora";

export default function AboutPanel({ model: m }: { model: BrowserModel }) {
  const openWebsite = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!m.isNative) return;
    event.preventDefault();
    if (await m.run("tab_create", { url: "https://alshaye.ai/" }))
      m.setSection("browser");
  };
  const ar = m.locale === "ar";
  const [view, setView] = useState<"about" | "features">("about");
  const views = [["about", m.t("about")], ["features", ar ? "خصائص لبيب" : "Features"]] as const;
  return (
    <div className="content-page about-page about-compact">
      <div className="about-topline">
        <span>{m.t("about")}</span>
        <span className="about-version">{m.t("version")} <bdi>{version}</bdi></span>
      </div>
      <div className="about-tabs" role="tablist" aria-label={m.t("about")}
        onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setView(view === "about" ? "features" : "about"); } }}>
        {views.map(([key, label]) => (
          <button key={key} type="button" role="tab" id={`about-tab-${key}`} aria-selected={view === key} aria-controls="about-tabpanel"
            tabIndex={view === key ? 0 : -1} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      <div id="about-tabpanel" role="tabpanel" aria-labelledby={`about-tab-${view}`}>
      {view === "features" ? <AboutFeatures ar={ar} /> : <>
      <div className="about-summary">
      <section className="about-hero" aria-labelledby="about-title">
        <img src={aboutArtwork} alt="" width={1672} height={941} decoding="async" loading="lazy" />
        <p className="about-wordmark" lang="en" dir="ltr">LABEEB BROWSER</p>
        <h1 id="about-title">{m.t("brand")}</h1>
        <p className="about-tagline">{m.t("aboutTagline")}</p>
      </section>
      <section className="developer-card" aria-labelledby="developer-name">
        <div className="developer-identity">
          <div className="developer-monogram" aria-hidden="true">ش</div>
          <div>
            <p className="about-label">{m.t("aboutDeveloper")}</p>
            <h2 id="developer-name">{m.t("developerName")}</h2>
            <p className="developer-role">{m.t("developerRole")}</p>
          </div>
        </div>
        <a className="developer-link" href="https://alshaye.ai/" target="_blank" rel="noopener noreferrer" onClick={openWebsite}>
          <Globe2 size={19} aria-hidden="true" />
          <span><span className="developer-link-label">{m.t("personalWebsite")}</span><strong dir="ltr">alshaye.ai</strong></span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </a>
      </section>
      </div>
      <section className="about-origin" aria-label={m.t("aboutOrigin")}>
        <span className="about-origin-icon"><MapPin size={22} aria-hidden="true" /></span>
        <div><h2>{m.t("developedInSaudi")}</h2><p>{m.t("openSourceFoundation")}</p></div>
        <span className="about-origin-country" lang="en" dir="ltr">SAUDI ARABIA</span>
      </section>
      <section className="about-origin about-viora" aria-labelledby="about-viora-title">
        <span className="about-origin-icon"><Clapperboard size={22} aria-hidden="true" /></span>
        <div>
          <h2 id="about-viora-title"><bdi lang="en">Viora</bdi> — {ar ? "مشاهدة بلا إعلانات" : "ad-free viewing"}</h2>
          <p>{ar
            ? "مشغّل يوتيوب من تطوير شايع الشايع، مدمج في لبيب ويعمل في تبويب معزول لا يشارك ملفات تعريف الارتباط مع تصفحك. يستند إلى مشروع FreeTube مفتوح المصدر، ولا تربطه أي صلة بشركة Google أو منصة YouTube."
            : "A YouTube player developed by Shaye Alshaye and integrated into Labeeb. It runs in an isolated tab that shares no cookies with your browsing. Based on the open-source FreeTube project; not affiliated with Google or YouTube."}</p>
        </div>
        <button type="button" className="button about-viora-open" disabled={m.busy || !m.isNative} onClick={() => void openViora(m)}>
          {ar ? "افتح Viora" : "Open Viora"}<ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </section>
      <section className="about-origin" aria-labelledby="about-engine-title">
        <span className="about-origin-icon"><Globe2 size={22} aria-hidden="true" /></span>
        <div>
          <h2 id="about-engine-title">{m.t("nativeEngine")}</h2>
          <p><bdi>WebView2</bdi> {ar ? "على" : "on"} <bdi>Windows</bdi></p>
          <p><bdi>WKWebView</bdi> {ar ? "على" : "on"} <bdi>macOS</bdi></p>
        </div>
      </section>
      <details className="about-credits">
        <summary>{m.t("creditsAndLicenses")}</summary>
        <div className="about-credits-content">
          <p>{m.t("creditsIntro")}</p>
          <dl className="about-stack">
            <div><dt>Tauri · React · TypeScript · Rust</dt><dd>{m.t("creditsApp")}</dd></div>
            <div><dt>WebView2 · WKWebView</dt><dd>{m.t("creditsBrowsing")}</dd></div>
            <div><dt>Tajawal</dt><dd>{m.t("creditsFont")}</dd></div>
            <div><dt>Viora · FreeTube</dt><dd>{ar ? "مشغّل يوتيوب بلا إعلانات؛ برنامج مستقل يُرفق مع لبيب بترخيص AGPL-3.0" : "Ad-free YouTube player; a separate program distributed with Labeeb under AGPL-3.0"}</dd></div>
          </dl>
          {[
            [m.t("sourceNotices"), notices],
            ["Labeeb — Apache-2.0", appLicense],
            ["Tajawal — SIL Open Font License", fontLicense],
            ["Viora (FreeTube) — AGPL-3.0", vioraLicense],
          ].map(([label, content]) => (
            <details className="about-license" key={label}>
              <summary>{label}</summary><pre dir="ltr" lang="en">{content}</pre>
            </details>
          ))}
        </div>
      </details>
      </>}
      </div>
      <footer className="about-footer"><span>{m.t("aboutSignature")}</span></footer>
    </div>
  );
}
