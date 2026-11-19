import type { BrowserModel } from "./useBrowser";

/**
 * Viora is the maker's ad-free YouTube client. When its interface ships beside
 * Labeeb it opens as a tab; otherwise Labeeb starts the separate Viora program.
 */

/** The 11-character video id of a YouTube watch, shorts, embed, live or youtu.be address. */
export function youtubeVideoId(value: string): string | null {
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password || u.port) return null;
    let id = "";
    if (u.hostname === "youtu.be") id = u.pathname.slice(1);
    else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(u.hostname)) {
      const parts = u.pathname.split("/").filter(Boolean);
      id = u.pathname === "/watch" ? u.searchParams.get("v") ?? ""
        : parts.length === 2 && ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : "";
    }
    return /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

/**
 * Opens Viora, optionally on a YouTube video. Built in, it shows in a tab.
 * Otherwise the separate program starts, and if Labeeb does not know where it
 * is installed yet it asks once with a file picker.
 */
export async function openViora(m: BrowserModel, videoUrl?: string): Promise<boolean> {
  const ar = m.locale === "ar";
  if (m.snapshot.settings.vioraBuiltIn) {
    const ok = await m.run("viora_open", { url: videoUrl ?? null });
    if (ok) m.setSection("browser");
    return ok;
  }
  return m.run("viora_open", { url: videoUrl ?? null },
    videoUrl ? (ar ? "فُتح الفيديو في Viora بلا إعلانات." : "Opened the video in Viora, ad-free.") : (ar ? "فُتح Viora." : "Viora opened."));
}
