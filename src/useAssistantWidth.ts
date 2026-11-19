import { useEffect, useRef, useState } from 'react';
export const assistantWidth = (value: number, viewport: number) => Math.round(Math.max(280, Math.min(Number.isFinite(value) ? value : 380, 720, viewport - 400)));
export function useAssistantWidth(ar: boolean) {
  const [width, setWidth] = useState(() => {
    let saved = 380;
    try { saved = Number(localStorage.getItem('labeeb-assistant-width')) || 380; } catch { /* Unavailable storage. */ }
    return assistantWidth(saved, window.innerWidth);
  });
  const drag = useRef<{x: number; width: number} | null>(null);
  const lastWidth = useRef(width);
  const update = (value: number) => setWidth(assistantWidth(value, window.innerWidth));
  useEffect(() => { if (lastWidth.current === width) return; lastWidth.current = width; try { localStorage.setItem('labeeb-assistant-width', String(width)); } catch { /* Optional preference. */ } }, [width]);
  useEffect(() => { const resize = () => setWidth(value => assistantWidth(value, window.innerWidth)); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  return {width, handle: {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {x: event.clientX, width};
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (drag.current) update(drag.current.width + (event.clientX - drag.current.x) * (ar ? 1 : -1));
    },
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
    onLostPointerCapture: () => { drag.current = null; },
    onPointerCancel: () => { drag.current = null; },
    onDoubleClick: () => update(380),
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault(); update(width + (event.key === 'ArrowRight' ? 24 : -24) * (ar ? 1 : -1));
      } else if (event.key === 'Home') { event.preventDefault(); update(280); }
      else if (event.key === 'End') { event.preventDefault(); update(720); }
    },
  }};
}
