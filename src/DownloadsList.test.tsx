import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DownloadsList, { formatBytes, formatDuration } from "./DownloadsList";
import type { BrowserModel } from "./useBrowser";

afterEach(cleanup);
const model = (snapshot: unknown, run = vi.fn(async (..._args: unknown[]) => true)) => ({ locale: "en", busy: false, isNative: true, run, snapshot }) as unknown as BrowserModel;

describe("downloads list", () => {
  it("formats sizes and remaining time for reading", () => {
    expect(formatBytes(512, false)).toBe("512 B");
    expect(formatBytes(1536, false)).toBe("1.5 KB");
    expect(formatBytes(5.2 * 1024 ** 3, false)).toBe("5.2 GB");
    expect(formatBytes(312 * 1024 ** 2, false)).toBe("312 MB");
    expect(formatDuration(45, false)).toBe("45 s");
    expect(formatDuration(200, false)).toBe("3 min 20 s");
    expect(formatDuration(4320, false)).toBe("1 h 12 min");
  });

  it("shows files and videos together, newest first, with live progress", () => {
    const m = model({
      downloads: [
        { id: "old", name: "notes.pdf", url: "https://example.com/notes.pdf", status: "completed", totalBytes: 2048, native: true, startedMs: 1000 },
        { id: "win", name: "Windows.iso", url: "https://example.com/Windows.iso", status: "running", receivedBytes: 1024 ** 3, totalBytes: 4 * 1024 ** 3, bytesPerSecond: 10 * 1024 ** 2, native: true, startedMs: 3000 },
      ],
      video: { folder: "", ready: true, jobs: [{ id: "vid", url: "https://www.youtube.com/watch?v=BaW_jenozKc", title: "A video", quality: "720", status: "running", percent: 41.6, speed: "2.1MiB/s", eta: "00:30", folder: "D:\\Videos", startedMs: 2000 }] },
    });
    render(<DownloadsList m={m} />);
    const titles = screen.getAllByRole("article").map(row => within(row).getByRole("strong", { hidden: true }).textContent);
    expect(titles).toEqual(["Windows.iso", "A video", "notes.pdf"]);
    const windows = screen.getAllByRole("article")[0];
    expect(windows.textContent).toContain("25%");
    expect(windows.textContent).toContain("1.0 GB of 4.0 GB");
    expect(windows.textContent).toContain("10.0 MB/s");
    expect(windows.textContent).toContain("left 5 min 7 s");
    expect(within(windows).getByRole("progressbar").getAttribute("value")).toBe("25");
    expect(screen.getAllByRole("article")[1].textContent).toContain("42%");
  });

  it("cancels, removes records and clears the list without deleting files", () => {
    const run = vi.fn(async (..._args: unknown[]) => true);
    const m = model({
      downloads: [
        { id: "run", name: "big.zip", url: "https://example.com/big.zip", status: "running", native: true, startedMs: 2 },
        { id: "done", name: "done.zip", url: "https://example.com/done.zip", status: "completed", native: true, startedMs: 1 },
      ],
      video: { folder: "", ready: true, jobs: [{ id: "bad", url: "https://youtu.be/BaW_jenozKc", title: "Failed video", quality: "audio", status: "failed", percent: 0, speed: "", eta: "", folder: "D:\\V", error: "Sign-in required", startedMs: 0 }] },
    }, run);
    render(<DownloadsList m={m} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(run).toHaveBeenCalledWith("download_cancel", { id: "run" });
    expect(screen.queryByRole("button", { name: "Remove from list: big.zip" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove from list: Failed video" }));
    expect(run).toHaveBeenCalledWith("download_dismiss", { id: "bad" });
    fireEvent.click(screen.getByRole("button", { name: "Clear list" }));
    expect(run).toHaveBeenCalledWith("downloads_clear");
    // Deleting the file itself still asks first.
    fireEvent.click(screen.getByRole("button", { name: "Delete file: done.zip" }));
    expect(screen.getByRole("alertdialog").textContent).toContain("done.zip");
    expect(run.mock.calls.some(([name]) => name === "download_delete")).toBe(false);
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(<DownloadsList m={model({ downloads: [] })} />);
    expect(container.firstChild).toBeNull();
  });
});
