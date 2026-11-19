import { Bot, Clapperboard, Download, Gauge, Languages, Lock, Scale, ShieldCheck, SlidersHorizontal } from "./icons";
import type { LucideIcon } from "./icons";

interface Feature { icon: LucideIcon; ar: [string, string]; en: [string, string]; highlight?: boolean }

// Product copy in a formal register. Each statement describes what the program
// does; none compares it with other browsers.
const features: Feature[] = [
  { icon: Lock, highlight: true,
    ar: ["خصوصية تبدأ من جهازك", "يُحفظ سجل التصفح والمفضلة والإعدادات والجلسات على جهازك حصرًا؛ دون حساب مستخدم، ودون مزامنة سحابية، ودون إرسال أي بيانات استخدام."],
    en: ["Privacy by design", "Browsing history, bookmarks, settings and sessions are stored exclusively on your device. No account, no cloud synchronization, and no usage data transmitted."] },
  { icon: Gauge, highlight: true,
    ar: ["أداء عالٍ بنواة Rust", "نواة مكتوبة بلغة Rust على إطار Tauri تمنح واجهة سريعة الاستجابة واستهلاكًا منخفضًا للموارد، مع تحميل مؤجل للتبويبات المستعادة وحزمة تثبيت بحجم 33 ميغابايت تقريبًا."],
    en: ["High performance, built on Rust", "A core written in Rust on the Tauri framework delivers a responsive interface and low resource consumption, with deferred loading of restored tabs and an installer of approximately 33 MB."] },
  { icon: Languages,
    ar: ["تجربة عربية أصيلة", "واجهة مصممة للعربية من اليمين إلى اليسار بخط Tajawal، مع دعم كامل للغة الإنجليزية والتبديل الفوري بين اللغتين."],
    en: ["An Arabic-first experience", "An interface designed for Arabic, right to left and set in Tajawal, with full English support and instant switching between the two languages."] },
  { icon: Clapperboard,
    ar: ["Viora: مشاهدة بلا إعلانات", "مشغّل يوتيوب مدمج يعمل في تبويب معزول دون ملفات تعريف الارتباط، ويحفظ سجل المشاهدة والاشتراكات محليًا."],
    en: ["Viora: ad-free viewing", "An integrated YouTube player that runs in an isolated, cookie-free tab and keeps watch history and subscriptions on your device."] },
  { icon: Download,
    ar: ["تنزيل الوسائط وإدارتها", "تنزيل الفيديو بدقة تصل إلى 1080p، أو الصوت منفردًا، مباشرةً من المشغّل، مع مكتبة مرئية لتشغيل المحتوى المحفوظ وإدارته."],
    en: ["Media downloads and library", "Download video at up to 1080p, or audio alone, directly from the player, with a visual library for playing and managing saved content."] },
  { icon: ShieldCheck,
    ar: ["أمان مبني في التصميم", "فصل صارم بين المواقع وأوامر المتصفح، وشريط عنوان يعكس الصفحة المعروضة فعليًا، وتحقق من سلامة الأدوات الخارجية ببصمات SHA-256 قبل تشغيلها."],
    en: ["Security by design", "Strict separation between websites and browser commands, an address bar that reflects the page actually displayed, and SHA-256 integrity verification of external tools before they run."] },
  { icon: Bot,
    ar: ["مساعد ذكي تحت تحكمك", "يُحفظ مفتاح الخدمة في مخزن بيانات الاعتماد الخاص بالنظام، ولا يُرسل المساعد سوى ما تكتبه؛ فلا يطّلع على محتوى الصفحات تلقائيًا."],
    en: ["An AI assistant under your control", "Your service key is held in the operating system's credential store, and the assistant transmits only what you type; it never reads page content automatically."] },
  { icon: SlidersHorizontal,
    ar: ["تخصيص مرن", "مظهر فاتح وداكن، وشريط جانبي قابل للتكيّف، واختصارات لوحة مفاتيح، مع اختيار محرك البحث ومسح بيانات المواقع من الإعدادات."],
    en: ["Flexible personalization", "Light and dark appearance, an adaptive sidebar and keyboard shortcuts, with search-engine selection and site-data clearing available in Settings."] },
  { icon: Scale,
    ar: ["مفتوح المصدر وشفاف", "شيفرة لبيب المصدرية متاحة بترخيص Apache-2.0، ويعتمد عرض صفحات الويب على محرك النظام WebView2 المبني على Chromium."],
    en: ["Open source and transparent", "Labeeb's source code is available under the Apache-2.0 license. Web pages are rendered by the system engine, WebView2, which is based on Chromium."] },
];

export default function AboutFeatures({ ar }: { ar: boolean }) {
  return (
    <section className="about-features" aria-label={ar ? "خصائص لبيب" : "Labeeb features"}>
      <p className="about-features-lead">{ar ? "متصفح عربي يضع الخصوصية والأداء في صميم تصميمه." : "An Arabic-first browser with privacy and performance at its core."}</p>
      <div className="about-features-grid">
        {features.map(({ icon: Icon, ar: arabic, en, highlight }) => {
          const [title, detail] = ar ? arabic : en;
          return (
            <article key={en[0]} className={`about-feature ${highlight ? "highlight" : ""}`}>
              <span className="about-feature-icon"><Icon size={22} aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
