import { expect, it, vi } from "vitest";
import overlay from "../src-tauri/src/video-overlay.js?raw";
it("adds a button to a video and detects a dynamically inserted unsupported player", async () => {
  vi.stubGlobal('ResizeObserver', class {observe() {} unobserve() {} disconnect() {}});
  const roots: ShadowRoot[] = [];
  const original = HTMLElement.prototype.attachShadow;
  const spy = vi.spyOn(HTMLElement.prototype, "attachShadow").mockImplementation(function(this:HTMLElement, options) {
    const root = original.call(this, options); roots.push(root); return root;
  });
  const bounds = vi.spyOn(HTMLVideoElement.prototype, "getBoundingClientRect").mockReturnValue({x:10,y:10,top:10,left:10,right:650,bottom:370,width:640,height:360,toJSON:()=>({})});
  document.body.innerHTML = '<video src="https://example.org/sample.mp4"></video>';
  window.eval(overlay);
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(roots[0].querySelectorAll('button')).toHaveLength(1);
  expect(roots[0].querySelector('button')?.disabled).toBe(false);
  const video = document.createElement('video'); video.src = 'blob:unsupported'; document.body.append(video);
  await new Promise(resolve=>setTimeout(resolve,250));
  expect(roots[0].querySelectorAll('button')).toHaveLength(2);
  expect(roots[0].querySelectorAll('button')[1].disabled).toBe(true);
  spy.mockRestore(); bounds.mockRestore();
  vi.unstubAllGlobals();
});
