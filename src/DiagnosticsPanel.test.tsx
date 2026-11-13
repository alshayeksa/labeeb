import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DiagnosticsPanel from "./DiagnosticsPanel";
const { command } = vi.hoisted(() => ({command: vi.fn()}));
vi.mock("./bridge", () => ({command}));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows a DNS failure and subsequent success without dropping either", async () => {
  command.mockResolvedValue({path:"C:/logs/navigation-events.jsonl", error:null, events:[
    {time:2,session:"session",tab:"tab",event:"navigation_completed",details:{success:true,navigationId:"2",origin:"https://example.com"}},
    {time:1,session:"session",tab:"tab",event:"navigation_completed",details:{success:false,navigationId:"1",webErrorStatus:13,origin:"https://example.com"}},
  ]});
  render(<DiagnosticsPanel locale="en"/>);
  expect(await screen.findByText("Navigation failed")).toBeInTheDocument();
  expect(screen.getByText("Loaded")).toBeInTheDocument();
  expect(screen.getByText("C:/logs/navigation-events.jsonl")).toBeInTheDocument();
  expect(command).toHaveBeenCalledWith("diagnostics_snapshot");
});
it("reports persistence failure", async () => {
  command.mockResolvedValue({path:"log",error:"Unable to persist diagnostic events",events:[]});
  render(<DiagnosticsPanel locale="en"/>);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to persist");
});
