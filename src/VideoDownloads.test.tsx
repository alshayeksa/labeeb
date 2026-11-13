import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VideoDownloads, { isYouTubeVideo } from "./VideoDownloads";
import type { BrowserModel } from "./useBrowser";
describe("video downloads", () => {
  it("recognizes supported pages without accepting lookalike hosts", () => {
    expect(isYouTubeVideo("https://www.youtube.com/watch?v=BaW_jenozKc&list=abc")).toBe(true);
    expect(isYouTubeVideo("https://youtu.be/BaW_jenozKc")).toBe(true);
    expect(isYouTubeVideo("https://youtube.com.evil.test/watch?v=BaW_jenozKc")).toBe(false);
    expect(isYouTubeVideo("https://youtube.com/playlist?list=abc")).toBe(false);
    expect(isYouTubeVideo("https://user@youtube.com/watch?v=BaW_jenozKc")).toBe(false);
  });
  it("submits the selected audio format and cancels a queued job", () => {
    const run = vi.fn();
    const m = {locale:"en", busy:false, isNative:true, run, snapshot:{video:{folder:"D:\\Videos", ready:true, jobs:[{id:"queued-1", title:"Test", quality:"720", status:"queued", folder:"D:\\Videos"}]}}} as unknown as BrowserModel;
    render(<VideoDownloads m={m} initialUrl="https://youtu.be/BaW_jenozKc"/>);
    fireEvent.change(screen.getByLabelText("Quality"), {target:{value:"audio"}});
    fireEvent.click(screen.getByRole("button", {name:"Download"}));
    expect(run).toHaveBeenCalledWith("video_start", {url:"https://youtu.be/BaW_jenozKc", quality:"audio", folder:null});
    fireEvent.click(screen.getByRole("button", {name:"Cancel"}));
    expect(run).toHaveBeenCalledWith("video_cancel", {id:"queued-1"});
  });
});
