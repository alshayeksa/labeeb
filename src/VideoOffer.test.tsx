import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { expect, it, vi, afterEach } from "vitest";
afterEach(cleanup);
import VideoOffer from "./VideoOffer";
it("offers quality immediately and requires an explicit choice before downloading", () => {
  const download = vi.fn(), close = vi.fn();
  render(<VideoOffer offer={{url:"https://www.youtube.com/watch?v=jNQXAC9IVRw",kind:"youtube",tabId:"tab-1"}} ar={false} busy={false} close={close} download={download}/>);
  expect(download).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name:"1080p"}));
  expect(download).toHaveBeenCalledWith("1080");
  fireEvent.keyDown(screen.getByRole("dialog"), {key:"Escape"});
  expect(close).toHaveBeenCalled();
});
it("offers a direct video without pretending quality choices exist", () => {
  const download = vi.fn();
  render(<VideoOffer offer={{url:"https://example.org/video.mp4",kind:"direct",tabId:"tab-1"}} ar={false} busy={false} close={()=>{}} download={download}/>);
  expect(screen.queryByText("1080p")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name:"Download video"}));
  expect(download).toHaveBeenCalledWith("direct");
});
