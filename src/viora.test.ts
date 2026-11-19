import { describe, it, expect, vi } from "vitest";
import { openViora, youtubeVideoId } from "./viora";
import type { BrowserModel } from "./useBrowser";

describe("Viora integration", () => {
  it("recognizes YouTube video addresses", () => {
    for (const url of ["https://www.youtube.com/watch?v=BaW_jenozKc&list=abc", "https://youtu.be/BaW_jenozKc?t=3", "https://m.youtube.com/shorts/BaW_jenozKc", "https://www.youtube.com/live/BaW_jenozKc"]) {
      expect(youtubeVideoId(url)).toBe("BaW_jenozKc");
    }
  });
  it("ignores lookalike hosts, non-video pages and malformed ids", () => {
    for (const url of ["https://youtube.com.evil.test/watch?v=BaW_jenozKc", "https://www.youtube.com/", "https://www.youtube.com/playlist?list=abc", "https://youtu.be/short", "https://user@youtube.com/watch?v=BaW_jenozKc", "not a url"]) {
      expect(youtubeVideoId(url)).toBeNull();
    }
  });
  it("shows the built-in Viora in a tab without a notice", async () => {
    const run = vi.fn(async () => true), setSection = vi.fn();
    const m = { run, setSection, locale: "en", snapshot: { settings: { vioraBuiltIn: true } } } as unknown as BrowserModel;
    await openViora(m, "https://youtu.be/BaW_jenozKc");
    expect(run).toHaveBeenLastCalledWith("viora_open", { url: "https://youtu.be/BaW_jenozKc" });
    expect(setSection).toHaveBeenCalledWith("browser");
  });
  it("starts the desktop program, with the video when one is given", async () => {
    const run = vi.fn(async () => true);
    const m = { run, locale: "en", snapshot: { settings: {} } } as unknown as BrowserModel;
    await openViora(m);
    expect(run).toHaveBeenLastCalledWith("viora_open", { url: null }, "Viora opened.");
    await openViora(m, "https://youtu.be/BaW_jenozKc");
    expect(run).toHaveBeenLastCalledWith("viora_open", { url: "https://youtu.be/BaW_jenozKc" }, "Opened the video in Viora, ad-free.");
  });
});
