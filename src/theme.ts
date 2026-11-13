import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const key = "labeeb.theme";
export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(key);
    if (value === "light" || value === "dark") return value;
  } catch { /* Use the system preference when storage is unavailable. */ }
  return "system";
}
function systemTheme(): "light" | "dark" {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function applyTheme(preference: ThemePreference) {
  const resolved = preference === "system" ? systemTheme() : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);
  const [resolved, setResolved] = useState(() => preference === "system" ? systemTheme() : preference);
  useEffect(() => {
    const update = () => setResolved(applyTheme(preference));
    update();
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : undefined;
    media?.addEventListener("change", update);
    return () => media?.removeEventListener("change", update);
  }, [preference]);
  const change = (value: ThemePreference) => {
    try { localStorage.setItem(key, value); } catch { /* Retain the choice for this session. */ }
    setPreference(value);
    setResolved(applyTheme(value));
  };
  return { preference, resolved, change };
}
export type ThemeModel = ReturnType<typeof useTheme>;
