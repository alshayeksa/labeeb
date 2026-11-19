import { useState } from "react";
import MediaLibrary from "./MediaLibrary";
import DownloadsList from "./DownloadsList";
import { command } from "./bridge";
import type { BrowserModel } from "./useBrowser";
export function isYouTubeVideo(value: string) {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.port) return false;
    if (u.hostname === "youtu.be") return /^\/[\w-]{11}$/.test(u.pathname);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(u.hostname) &&
      ((u.pathname === "/watch" && /^[\w-]{11}$/.test(u.searchParams.get("v") ?? "")) || /^\/(shorts|embed|live)\/[\w-]{11}\/?$/.test(u.pathname));
  } catch { return false; }
}
export default function VideoDownloads({ m, initialUrl }: { m: BrowserModel; initialUrl: string }) {
  const ar = m.locale === "ar", state = m.snapshot.video;
  const [url, setUrl] = useState(initialUrl), [quality, setQuality] = useState("720"), [folder, setFolder] = useState(""), [choosing, setChoosing] = useState(false);
  const text = (a: string, e: string) => ar ? a : e;
  const start = () => void m.run("video_start", {url, quality, folder:folder || null});
  return <><DownloadsList m={m}/><MediaLibrary m={m}/><section className="video-downloads" aria-label={text("تحميل الفيديو", "Video downloads")}>
    <details open={initialUrl ? true : undefined}><summary>{text("إضافة رابط تحميل", "Add a download link")}</summary>
    <p className="field-hint">{text("فيديو واحد في كل مرة للحفاظ على خفة التصفح. الأدوات تُجهّز عند أول استخدام وقد يستغرق ذلك بضع دقائق.", "One download at a time to keep browsing light. Tools are prepared on first use; this may take a few minutes.")}</p>
    <form onSubmit={e => {e.preventDefault(); start();}} className="video-form">
      <label>{text("رابط الفيديو", "Video URL")}<input type="url" dir="ltr" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" required /></label>
      <label>{text("الجودة", "Quality")}<select value={quality} onChange={e => setQuality(e.target.value)}>
        <option value="720">720p · MP4</option><option value="1080">1080p · MP4</option><option value="audio">{text("صوت فقط · M4A", "Audio only · M4A")}</option>
      </select></label>
      <label>{text("مجلد الحفظ", "Save folder")}<input readOnly dir="auto" value={folder || state?.folder || text("التنزيلات / Labeeb", "Downloads / Labeeb")} /></label>
      <button className="button" type="button" disabled={choosing || !m.isNative} onClick={async () => {
        setChoosing(true); try { const chosen = await command<string | null>("video_choose_folder"); if (chosen) setFolder(chosen); }
        catch (e) { m.notify(String(e), true); } finally { setChoosing(false); }
      }}>{text("تغيير المجلد", "Choose folder")}</button>
      <button className="button primary" disabled={m.busy || !isYouTubeVideo(url)}>{text("تحميل", "Download")}</button>
    </form>
    <p className="field-hint">{text("الجودة حتى الحد المختار حسب المتاح. قوائم التشغيل والبث المباشر غير مدعومة حاليًا.", "Quality up to the selected limit, when available. Playlists and live streams are not supported yet.")}</p>
    </details>
  </section></>;
}
