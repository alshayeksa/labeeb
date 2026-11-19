import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PasswordVault from "./PasswordVault";
const command = vi.hoisted(() => vi.fn());
vi.mock("./bridge", () => ({ command }));
const entry = { id: "vault-id", origin: "https://example.com", username: "person" };
beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  command.mockImplementation(async (name: string) => {
    if (name === "vault_status") return true;
    if (name === "vault_list") return [entry];
    if (name === "vault_reveal") return "private-test-secret";
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); command.mockReset(); });
async function open() {
  render(<PasswordVault ar={false} enabled/>);
  fireEvent.click(screen.getByRole("button", { name: "Manage passwords" }));
  await screen.findByText("person");
  await waitFor(() => expect(screen.getByRole("button", { name: /^Show person/ })).toBeEnabled());
}
it("does not load vault contents before unlock succeeds and stays closed on cancellation", async () => {
  command.mockRejectedValueOnce("VAULT_AUTH_CANCELLED");
  render(<PasswordVault ar={false} enabled/>);
  fireEvent.click(screen.getByRole("button", { name: "Manage passwords" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Verification cancelled");
  expect(command).toHaveBeenCalledWith("vault_unlock", { ar: false });
  expect(command.mock.calls.some(([name]) => name === "vault_list")).toBe(false);
  expect(screen.queryByText("person")).not.toBeInTheDocument();
});
it("lists only metadata and reveals only after the native verification command resolves", async () => {
  await open();
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
  let resolve!: (secret: string) => void;
  command.mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: /^Show person/ }));
  expect(command).toHaveBeenLastCalledWith("vault_reveal", { id: entry.id, ar: false });
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
  await act(async () => resolve("private-test-secret"));
  expect(screen.getByText("private-test-secret")).toBeInTheDocument();
  fireEvent.blur(window);
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
});
it("hides secrets after twenty seconds and discards late responses after closing", async () => {
  await open();
  vi.useFakeTimers();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Show person/ })));
  expect(screen.getByText("private-test-secret")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
  let resolve!: (secret: string) => void;
  command.mockImplementationOnce(() => new Promise<string>(done => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: /^Show person/ }));
  fireEvent.click(screen.getByRole("button", { name: "Close vault" }));
  await act(async () => resolve("private-test-secret"));
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
});
it("fails closed on cancellation and does not expose native errors", async () => {
  await open();
  command.mockRejectedValueOnce("VAULT_AUTH_CANCELLED");
  fireEvent.click(screen.getByRole("button", { name: /^Show person/ }));
  expect(await screen.findByRole("status")).toHaveTextContent("Verification cancelled");
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
});
it("requires explicit confirmation before requesting verified deletion", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: /^Delete person/ }));
  expect(command.mock.calls.some(([name]) => name === "vault_delete")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(command.mock.calls.some(([name]) => name === "vault_delete")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: /^Delete person/ }));
  fireEvent.click(screen.getByRole("button", { name: "Delete password" }));
  await waitFor(() => expect(command).toHaveBeenCalledWith("vault_delete", { id: entry.id, ar: false }));
});
it("saves through the vault command and clears the password draft on success", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Website (https://)"), { target: { value: "https://second.example" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "other" } });
  const password = screen.getByLabelText("Password");
  expect(password).toHaveAttribute("type", "password");
  fireEvent.change(password, { target: { value: "new-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Add to vault" }));
  await waitFor(() => expect(command).toHaveBeenCalledWith("vault_add", { site: "https://second.example", username: "other", password: "new-secret" }));
  await waitFor(() => expect(password).toHaveValue(""));
});
it("disables secret actions when Windows verification is unavailable", async () => {
  command.mockImplementation(async (name: string) => name === "vault_status" ? false : [entry]);
  render(<PasswordVault ar={false} enabled/>);
  fireEvent.click(screen.getByRole("button", { name: "Manage passwords" }));
  await screen.findByText("person");
  expect(screen.getByRole("button", { name: "Add to vault" })).toBeDisabled();
  expect(screen.getByRole("button", { name: /^Show person/ })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("Windows 11");
});
it("does not reveal a completed request in a background window", async () => {
  await open();
  vi.mocked(document.hasFocus).mockReturnValue(false);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: /^Show person/ })));
  expect(screen.queryByText("private-test-secret")).not.toBeInTheDocument();
});
