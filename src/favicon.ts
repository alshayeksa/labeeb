import { useEffect, useState } from "react";
import { command } from "./bridge";

// One image per site for the whole session; tabs of the same site share it.
const images = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function load(site: string): Promise<string | null> {
  let request = pending.get(site);
  if (!request) {
    request = command<string | null>("favicon", { site })
      .then(image => { if (image) images.set(site, image); return image ?? null; })
      .catch(() => null)
      .finally(() => pending.delete(site));
    pending.set(site, request);
  }
  return request;
}

/** The site icon as a data URL once the native side has it, otherwise undefined. */
export function useFavicon(site: string | undefined): string | undefined {
  const [image, setImage] = useState(() => (site ? images.get(site) : undefined));
  useEffect(() => {
    const known = site ? images.get(site) : undefined;
    setImage(known);
    if (!site || known) return;
    let current = true;
    void load(site).then(loaded => { if (current && loaded) setImage(loaded); });
    return () => { current = false; };
  }, [site]);
  return image;
}
