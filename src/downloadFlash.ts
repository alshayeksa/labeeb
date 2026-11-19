import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "./bridge";

/** Downloads still in progress: video jobs plus ordinary files. */
export function activeDownloadCount(snapshot: Snapshot): number {
  return (snapshot.video?.jobs.filter(job => !["completed", "failed", "cancelled"].includes(job.status)).length ?? 0)
    + snapshot.downloads.filter(item => item.status === "running" || item.status === "pending").length;
}

/** True for a few seconds each time a new download starts, to draw the eye to Downloads. */
export function useDownloadFlash(count: number): boolean {
  const previous = useRef(count), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const started = count > previous.current;
    previous.current = count;
    if (!started) return;
    setFlash(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(false), 4200);
  }, [count]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return flash;
}
