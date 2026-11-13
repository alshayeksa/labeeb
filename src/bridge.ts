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
}
export interface Approval {
  id: string;
  kind: string;
  summary: string;
  origin: string;
  payload?: string;
}
export interface Snapshot {
  video?: { folder: string; ready: boolean; jobs: VideoJob[] };
  libraryRevision?: number;
  tabs: Tab[];
  activeTabId: string | null;
  history: SavedPage[];
  bookmarks: SavedPage[];
  downloads: Download[];
  approvals: Approval[];
  settings: { locale: "ar" | "en"; aiConfigured: boolean };
  automation: {
    status: string;
    message?: string;
    frame?: string | null;
    inputVerified?: boolean;
  };
}
export interface VideoJob {
  id: string; url: string; title: string; quality: string; status: string;
  percent: number; speed: string; eta: string; folder: string; error?: string | null;
}
export const emptySnapshot: Snapshot = {
  tabs: [],
  activeTabId: null,
  history: [],
  bookmarks: [],
  downloads: [],
  approvals: [],
  settings: { locale: "ar", aiConfigured: false },
  automation: { status: "stopped", inputVerified: false },
};
export const native = () => isTauri();
export function command<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(name, args);
}
export function normalizeAddress(input: string): string {
  const value = input.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    const u = new URL(value);
    if (u.username || u.password) throw Error("credentials-in-url");
    return u.href;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw Error("unsupported-scheme");
  if (!/\s/.test(value) && (value.includes(".") || value === "localhost"))
    return new URL(`https://${value}`).href;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
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
