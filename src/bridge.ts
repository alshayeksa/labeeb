export type AiProvider = "openai" | "deepseek" | "claude" | "custom";
import { invoke, isTauri } from "@tauri-apps/api/core";
export interface Tab {
  id: string;
  title: string;
  url: string;
  loading?: boolean;
  zoom?: number;
  deferred?: boolean;
}
export interface SavedPage {
  id: number;
  title: string;
  url: string;
  visitedAt?: number | string;
}
export interface Download {
  error?: string | null;
  id: string;
  name: string;
  url: string;
  status: string;
  receivedBytes?: number;
  totalBytes?: number | null;
  /** Saved by the web engine itself rather than Labeeb's restricted fetcher. */
  native?: boolean;
  /** When the download began, in milliseconds since the epoch. */
  startedMs?: number;
  bytesPerSecond?: number;
  /** Parallel connections when the accelerated downloader is in use; 0 or absent otherwise. */
  connections?: number;
}
export interface Snapshot {
  fullscreen?: boolean;
  video?: { folder: string; ready: boolean; jobs: VideoJob[] };
  libraryRevision?: number;
  tabs: Tab[];
  activeTabId: string | null;
  history: SavedPage[];
  bookmarks: SavedPage[];
  downloads: Download[];
  settings: { passwordSave?: boolean; passwordSaveSupported?: boolean; locale: "ar" | "en"; aiConfigured: boolean; aiProvider?: AiProvider; aiConnection?: {provider: AiProvider; model: string; endpoint: string; protocol: "openai" | "anthropic"; workspace: string}; vioraPath?: string | null; vioraBuiltIn?: boolean };
}
export interface VideoJob {
  id: string; url: string; title: string; quality: string; status: string;
  percent: number; speed: string; eta: string; folder: string; error?: string | null; startedMs?: number;
}
export const emptySnapshot: Snapshot = {
  tabs: [],
  activeTabId: null,
  history: [],
  bookmarks: [],
  downloads: [],
  settings: { locale: "ar", aiConfigured: false },
};
export const native = () => isTauri();
export function command<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(name, args);
}
export const searchEngines = {
  google: { name: "Google", url: "https://www.google.com/search?q=" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=" },
  duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
} as const;
export type SearchEngine = keyof typeof searchEngines;
const searchKey = "labeeb.search";
export function readSearchEngine(): SearchEngine {
  try {
    const value = localStorage.getItem(searchKey);
    if (value && value in searchEngines) return value as SearchEngine;
  } catch { /* Fall back to the default engine when storage is unavailable. */ }
  return "google";
}
export function saveSearchEngine(value: SearchEngine) {
  try { localStorage.setItem(searchKey, value); } catch { /* Keep the default. */ }
}
/** Viora's interface is served to its tab at this address. */
export const VIORA_MOUNT = "https://www.youtube.com/__viora/";
/** What the address bar shows for a page: Viora pages get a short `viora:` form. */
export function displayAddress(url: string): string {
  if (!url.startsWith(VIORA_MOUNT)) return url;
  const hash = url.indexOf("#");
  return `viora:${hash >= 0 ? url.slice(hash + 1) : "/"}`;
}
export function normalizeAddress(input: string, engine: SearchEngine = readSearchEngine()): string {
  const value = input.trim();
  if (!value) return "";
  if (/^viora:/i.test(value)) {
    const route = value.slice(6).replace(/^\/*/, "/");
    return `${VIORA_MOUNT}index.html${route === "/" ? "" : `#${route}`}`;
  }
  if (/^https?:\/\//i.test(value)) {
    const u = new URL(value);
    if (u.username || u.password) throw Error("credentials-in-url");
    return u.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw Error("unsupported-scheme");
  if (!/\s/.test(value) && (value.includes(".") || value === "localhost"))
    return new URL(`https://${value}`).href;
  return `${searchEngines[engine].url}${encodeURIComponent(value)}`;
}
export function safeFrame(value?: string | null): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value))
    return value;
  if (/^[A-Za-z0-9+/=]+$/.test(value)) return `data:image/jpeg;base64,${value}`;
  return null;
}
export function historyDate(value: number | string, locale: string) {
  return new Date(
    typeof value === "number" ? value * 1000 : value,
  ).toLocaleDateString(locale);
}

export function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

// Complete only a bare hostname; keep full URLs, paths and search phrases intact.
export function completeAddress(input: string): string {
  const value = input.trim();
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(value) && value.toLowerCase() !== "localhost"
    ? `https://www.${value}.com/` : value;
}
export function nextZoom(current: number, direction: number): number {
  const levels = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  return direction > 0 ? levels.find(x => x > current + 0.001) ?? 5
    : [...levels].reverse().find(x => x < current - 0.001) ?? 0.25;
}
