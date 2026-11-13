import type { MouseEvent } from "react";
import { ArrowUpRight, Globe2, MapPin } from "lucide-react";
import logo from "./assets/labeeb-logo.png";
import { version } from "../package.json";
import appLicense from "../LICENSE?raw";
import notices from "../THIRD_PARTY_NOTICES.md?raw";
import obscuraLicense from "../licenses/Obscura-APACHE-2.0.txt?raw";
import fontLicense from "../licenses/Tajawal-OFL.txt?raw";
import type { BrowserModel } from "./useBrowser";

export default function AboutPanel({ model: m }: { model: BrowserModel }) {
  const openWebsite = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!m.isNative) return;
    event.preventDefault();
    if (await m.run("tab_create", { url: "https://alshaye.ai/" }))
      m.setSection("browser");
  };
  return (
    <div className="content-page about-page about-compact">
      <div className="about-topline">
        <span>{m.t("about")}</span>
        <span className="about-version">{m.t("version")} <bdi>{version}</bdi></span>
      </div>
      <div className="about-summary">
      <section className="about-hero" aria-labelledby="about-title">
        <img src={logo} alt="" width={104} height={104} />
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
      <details className="about-credits">
        <summary>{m.t("creditsAndLicenses")}</summary>
        <div className="about-credits-content">
          <p>{m.t("creditsIntro")}</p>
          <dl className="about-stack">
            <div><dt>Tauri · React · TypeScript · Rust</dt><dd>{m.t("creditsApp")}</dd></div>
            <div><dt>Obscura</dt><dd>{m.t("creditsAutomation")}</dd></div>
            <div><dt>WebView2 · WKWebView</dt><dd>{m.t("creditsBrowsing")}</dd></div>
            <div><dt>Tajawal</dt><dd>{m.t("creditsFont")}</dd></div>
          </dl>
          {[
            [m.t("sourceNotices"), notices],
            ["Labeeb — Apache-2.0", appLicense],
            ["Obscura — Apache-2.0", obscuraLicense],
            ["Tajawal — SIL Open Font License", fontLicense],
          ].map(([label, content]) => (
            <details className="about-license" key={label}>
              <summary>{label}</summary><pre dir="ltr" lang="en">{content}</pre>
            </details>
          ))}
        </div>
      </details>
      <footer className="about-footer"><span>{m.t("aboutSignature")}</span><span>{m.t("trialEdition")}</span></footer>
    </div>
  );
}
