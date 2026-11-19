import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PasswordPrompts from "./PasswordPrompts";
const mocks = vi.hoisted(() => ({ command: vi.fn(), handlers: new Map<string, (e: {payload: unknown}) => void>() }));
vi.mock("./bridge", () => ({ command: mocks.command }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async (name: string, callback: (e: {payload: unknown}) => void) => { mocks.handlers.set(name, callback); return () => mocks.handlers.delete(name); }) }));
const props = { ar: false, native: true, activeTab: "tab-one", fillTab: null, closeFill: vi.fn(), onOpenChange: vi.fn(), notify: vi.fn() };
const offer = { id: "proposal", tab: "tab-one", origin: "https://example.com", username: "person" };
beforeEach(() => { mocks.command.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); mocks.handlers.clear(); vi.clearAllMocks(); });
async function showOffer() {
  const view = render(<PasswordPrompts {...props}/>);
  await act(async () => mocks.handlers.get("password-offer")?.({ payload: offer }));
  return view;
}
it("shows metadata and saves only after explicit approval, sending no password through the UI", async () => {
  await showOffer();
  expect(screen.getByText("https://example.com")).toBeInTheDocument();
  expect(mocks.command).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(props.onOpenChange).not.toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("password_offer_save", { id: "proposal", ar: false }));
  expect(props.notify).toHaveBeenCalledWith("Password saved in Labeeb’s vault.");
});
it("dismisses an offer without saving and discards it when changing tabs", async () => {
  const view = await showOffer();
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  expect(mocks.command).toHaveBeenCalledWith("password_offer_dismiss", { id: "proposal" });
  expect(mocks.command.mock.calls.some(([name]) => name === "password_offer_save")).toBe(false);
  await act(async () => mocks.handlers.get("password-offer")?.({ payload: offer }));
  view.rerender(<PasswordPrompts {...props} activeTab="tab-other"/>);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("does not report success when verification is cancelled", async () => {
  await showOffer(); mocks.command.mockRejectedValueOnce("VAULT_AUTH_CANCELLED");
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringContaining("Verification cancelled"), true));
  expect(props.notify).not.toHaveBeenCalledWith("Password saved in Labeeb’s vault.");
});
it("fills only the chosen account through the verified native command", async () => {
  mocks.command.mockImplementation(async name => name === "password_fill_choices" ? { tab: "tab-one", url: "https://example.com/login", entries: [{ id: "account", origin: "https://example.com", username: "person" }] } : undefined);
  render(<PasswordPrompts {...props} fillTab="tab-one"/>);
  const account = await screen.findByRole("button", { name: "person" });
  expect(mocks.command.mock.calls.some(([name]) => name === "password_fill")).toBe(false);
  expect(mocks.command.mock.calls.some(([name]) => name === "vault_unlock")).toBe(false);
  fireEvent.click(account);
  await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("password_fill", { tab: "tab-one", url: "https://example.com/login", id: "account", ar: false }));
});
it("does not subscribe to repeated fill notices or unlock the vault on navigation", async () => {
  const view = render(<PasswordPrompts {...props}/>);
  expect(mocks.handlers.has("password-fill-available")).toBe(false);
  view.rerender(<PasswordPrompts {...props} activeTab="tab-other"/>);
  expect(mocks.command).not.toHaveBeenCalled();
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});
