import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { emptySnapshot } from "./bridge";
import type { Snapshot } from "./bridge";
const mocks = vi.hoisted(() => ({ native: vi.fn(), command: vi.fn() }));
vi.mock("./bridge", async (original) => ({
  ...(await original<typeof import("./bridge")>()),
  native: mocks.native,
  command: mocks.command,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn(async () => () => {}) }));
let state: Snapshot;
beforeEach(() => {
  localStorage.clear();
  state = structuredClone(emptySnapshot);
  mocks.native.mockReturnValue(false);
  mocks.command.mockImplementation(async (name: string) =>
    name === "app_snapshot" ? state : undefined,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe("desktop shell", () => {
  it("routes Ctrl+F to native find for the active page", async () => {
    mocks.native.mockReturnValue(true);
    state.tabs = [{id:"tab-find",title:"Example",url:"https://example.com"}]; state.activeTabId="tab-find";
    render(<App/>);
    await screen.findByRole("tab", {name:"Example"});
    fireEvent.keyDown(document, {key:"f",ctrlKey:true});
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_find",{id:"tab-find"}));
  });
  it("shows a download failure and retries only on an explicit click", async () => {
    mocks.native.mockReturnValue(true);
    state.downloads = [{id:"download-1",name:"file.zip",url:"https://example.com/file.zip",status:"failed",error:"Interrupted download"}];
    render(<App/>);
    await userEvent.click(screen.getByRole("button",{name:"التنزيلات"}));
    expect(await screen.findByText("Interrupted download")).toBeInTheDocument();
    expect(mocks.command.mock.calls.some(([name])=>name==="download_retry")).toBe(false);
    await userEvent.click(screen.getByRole("button",{name:"إعادة المحاولة"}));
    expect(mocks.command).toHaveBeenCalledWith("download_retry",{id:"download-1"});
  });
  it("switches appearance from the toolbar and retains the choice after remount", async () => {
    localStorage.setItem("labeeb.theme", "dark");
    const first = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "تفعيل الوضع النهاري" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("labeeb.theme")).toBe("light");
    first.unmount();
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "الإعدادات" }));
    expect(screen.getByRole("button", { name: "نهاري" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "ليلي" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
  it("persists sidebar size, keeps extra sections accessible and restores a hidden sidebar", async () => {
    const view = render(<App />);
    expect(screen.getByRole("navigation")).toHaveClass("compact");
    await userEvent.click(screen.getByRole("button", {name:"توسيع القائمة"}));
    expect(screen.getByRole("navigation")).toHaveClass("expanded");
    view.unmount();
    render(<App />);
    expect(screen.getByRole("navigation")).toHaveClass("expanded");
    await userEvent.click(screen.getByRole("button", {name:"المزيد"}));
    await userEvent.click(screen.getByRole("button", {name:"عن لبيب"}));
    expect(screen.getByRole("heading", {name:"شايع الشايع"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name:"إخفاء القائمة الجانبية"}));
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name:"إظهار القائمة الجانبية"}));
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });
  it("offers local history and bookmarks, then opens the keyboard-selected address", async () => {
    mocks.native.mockReturnValue(true);
    state.history = [{id:1, title:"متجر ريفي", url:"https://reefi.me/"}];
    state.bookmarks = [{id:2, title:"الموقع الشخصي", url:"https://alshaye.ai/"}];
    render(<App />);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("app_snapshot", expect.any(Object)));
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "reef");
    expect(await screen.findByRole("option", {name:/متجر ريفي/})).toBeInTheDocument();
    expect(mocks.command.mock.calls.some(([name]) => name === "tab_create")).toBe(false);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_create", {url:"https://reefi.me/"}));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("dismisses suggestions with Escape without losing the typed draft", async () => {
    mocks.native.mockReturnValue(true);
    state.history = [{id:1, title:"Reefi", url:"https://reefi.me/"}];
    render(<App />);
    const input = screen.getByRole("combobox");
    await userEvent.type(input, "reef");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("reef");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
  it("completes a bare hostname with Ctrl+Enter without double navigation", async () => {
    mocks.native.mockReturnValue(true);
    state.tabs = [{ id: "tab-1", title: "Page", url: "https://example.com" }];
    state.activeTabId = "tab-1";
    render(<App />);
    const input = screen.getByRole("combobox", { name: "ابحث أو أدخل عنوان موقع" });
    await waitFor(() => expect(input).toHaveValue("https://example.com"));
    fireEvent.change(input, { target: { value: "alshaye" } });
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_navigate", { id: "tab-1", url: "https://www.alshaye.com/" }));
    expect(mocks.command.mock.calls.filter(([name]) => name === "tab_navigate")).toHaveLength(1);
  });
  it("zooms the native page and reopens a closed tab with the standard shortcuts", async () => {
    mocks.native.mockReturnValue(true);
    state.tabs = [{ id: "tab-1", title: "Page", url: "https://example.com", zoom: 1.25 }];
    state.activeTabId = "tab-1";
    render(<App />);
    await screen.findByText("125%");
    fireEvent.keyDown(document, { key: "+", ctrlKey: true });
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_zoom", { id: "tab-1", scale: 1.5 }));
    await act(async () => {});
    fireEvent.keyDown(document, { key: "T", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_reopen", undefined));
  });
  it("opens the developer website in a native tab without navigating the privileged shell", async () => {
    mocks.native.mockReturnValue(true);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "المزيد" }));
    await userEvent.click(screen.getByRole("button", { name: "عن لبيب" }));
    const website = screen.getByRole("link", { name: /alshaye.ai/ });
    expect(website).toHaveAttribute("href", "https://alshaye.ai/");
    await userEvent.click(website);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("tab_create", { url: "https://alshaye.ai/" }));
    expect(screen.queryByRole("heading", { name: "شايع الشايع" })).not.toBeInTheDocument();
  });
  it("restores the actual address when switching tabs with the same URL", async () => {
    mocks.native.mockReturnValue(true);
    state.tabs = [
      { id: "tab-1", title: "One", url: "https://example.com" },
      { id: "tab-2", title: "Two", url: "https://example.com" },
    ];
    state.activeTabId = "tab-1";
    mocks.command.mockImplementation(async (name: string, args?: { id: string }) => {
      if (name === "tab_select") state = { ...state, activeTabId: args!.id };
      return name === "app_snapshot" ? state : undefined;
    });
    render(<App />);
    const input = screen.getByRole("combobox", { name: "ابحث أو أدخل عنوان موقع" });
    await waitFor(() => expect(input).toHaveValue("https://example.com"));
    await userEvent.clear(input);
    await userEvent.type(input, "https://draft.example");
    await userEvent.click(screen.getByRole("tab", { name: "Two" }));
    await waitFor(() => expect(input).toHaveValue("https://example.com"));
  });
  it.each([
    ["http://example.com", "اتصال HTTP غير مشفّر", false],
    ["https://example.com", "اتصال HTTPS", true],
    ["about:blank", "لا يوجد اتصال بصفحة", false],
  ])("shows the appropriate connection indicator for %s", async (url, label, locked) => {
    mocks.native.mockReturnValue(true);
    state.tabs = [{ id: "tab-1", title: "Page", url }];
    state.activeTabId = "tab-1";
    render(<App />);
    await screen.findByRole("tab", { name: "Page" });
    const indicator = screen.getByRole("img", { name: label });
    expect(!!indicator.querySelector(".lucide-lock-keyhole")).toBe(locked);
  });
  it("is Arabic first and does not fake desktop capabilities", async () => {
    render(<App />);
    expect(document.documentElement.dir).toBe("rtl");
    expect(
      screen.getByText("افتح تطبيق سطح المكتب للتصفح"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "علامة تبويب جديدة" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "يتطلب هذا الإجراء تطبيق سطح المكتب",
    );
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("switches to English and LTR without frontend storage", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "لغة الواجهة" }));
    expect(document.documentElement.dir).toBe("ltr");
    expect(screen.getByText("A calmer way to browse.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByText("AI connection")).toBeInTheDocument();
    expect(localStorage.length).toBe(0);
  });
  it("sends real navigation to the native backend", async () => {
    mocks.native.mockReturnValue(true);
    state.tabs = [{ id: "tab-1", title: "Page", url: "https://example.com" }];
    state.activeTabId = "tab-1";
    render(<App />);
    const input = screen.getByRole("combobox", {
      name: "ابحث أو أدخل عنوان موقع",
    });
    await waitFor(() => expect(input).toHaveValue("https://example.com"));
    await userEvent.clear(input);
    await userEvent.type(input, "https://openai.com{Enter}");
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith("tab_navigate", {
        id: "tab-1",
        url: "https://openai.com/",
      }),
    );
  });
  it("renders approval payload as text and requires explicit approval", async () => {
    mocks.native.mockReturnValue(true);
    state.approvals = [
      {
        id: "a1",
        kind: "message",
        summary: "Send a message",
        origin: "https://example.com",
        payload: "<img src=x onerror=alert(1)>",
      },
    ];
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "المزيد" }));
    await userEvent.click(screen.getByRole("button", { name: "الموافقات" }));
    expect(
      await screen.findByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(document.querySelector('img[src="x"]')).not.toBeInTheDocument();
    expect(
      mocks.command.mock.calls.some((c) => c[0] === "approval_resolve"),
    ).toBe(false);
    await userEvent.click(
      screen.getByRole("button", { name: "موافقة لمرة واحدة" }),
    );
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith("approval_resolve", {
        id: "a1",
        approved: true,
      }),
    );
  });
  it("clears transient secrets after native keychain save", async () => {
    mocks.native.mockReturnValue(true);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "الإعدادات" }));
    const field = screen.getByLabelText("مفتاح API");
    await userEvent.type(field, "test-not-real-secret");
    await userEvent.click(screen.getByRole("button", { name: "حفظ المفتاح" }));
    await waitFor(() => expect(field).toHaveValue(""));
    expect(mocks.command).toHaveBeenCalledWith("ai_key_save", {
      key: "test-not-real-secret",
    });
    expect(localStorage.length).toBe(0);
  });
  it("sends only the typed message to AI", async () => {
    mocks.native.mockReturnValue(true);
    state.settings.aiConfigured = true;
    mocks.command.mockImplementation(async (name: string) =>
      name === "app_snapshot"
        ? state
        : name === "ai_ask"
          ? { text: "Response" }
          : undefined,
    );
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "المساعد الذكي" }),
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: "اسأل المساعد…" }),
      "Help me plan",
    );
    await userEvent.click(screen.getByRole("button", { name: "إرسال" }));
    expect(await screen.findByText("Response")).toBeInTheDocument();
    expect(mocks.command).toHaveBeenCalledWith("ai_ask", {
      prompt: "Help me plan",
    });
  });
  it("disables input until backend verification", async () => {
    mocks.native.mockReturnValue(true);
    state.automation.status = "running";
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "المزيد" }));
    await userEvent.click(screen.getByRole("button", { name: "الأتمتة" }));
    expect(screen.getByRole("button", { name: "إدخال النص" })).toBeDisabled();
    expect(
      screen.getByText("الإدخال غير متاح حتى تتحقق الخدمة الأصلية من دعمه."),
    ).toBeInTheDocument();
  });
  it("does not allow an older snapshot to overwrite a newer result", async () => {
    mocks.native.mockReturnValue(true);
    let oldResolve!: (value: Snapshot) => void;
    let calls = 0;
    const old = structuredClone(emptySnapshot);
    old.settings.locale = "en";
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "app_snapshot") {
        calls++;
        if (calls === 1)
          return new Promise<Snapshot>((resolve) => {
            oldResolve = resolve;
          });
        return state;
      }
      return undefined;
    });
    render(<App />);
    await userEvent.click(
      screen.getByRole("button", { name: "علامة تبويب جديدة" }),
    );
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => oldResolve(old));
    expect(document.documentElement.lang).toBe("ar");
  });
  it("lets Escape cancel history deletion before queuing approval", async () => {
    mocks.native.mockReturnValue(true);
    state.history = [
      {
        id: 1,
        title: "Example",
        url: "https://example.com",
        visitedAt: 1794528000,
      },
    ];
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "السجل" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "مسح السجل" }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.command.mock.calls.some((c) => c[0] === "history_clear")).toBe(
      false,
    );
    await userEvent.click(screen.getByRole("button", { name: "مسح السجل" }));
    await userEvent.click(screen.getByRole("button", { name: "تأكيد" }));
    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith("history_clear", undefined),
    );
  });
  it("routes bookmark removal to localized approval instead of claiming deletion", async () => {
    mocks.native.mockReturnValue(true);
    state.bookmarks = [{ id: 8, title: "Example", url: "https://example.com" }];
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "bookmark_remove")
        state.approvals = [
          {
            id: "b1",
            kind: "destructive",
            summary: "Remove this bookmark",
            origin: "local",
            payload: "https://example.com",
          },
        ];
      if (name === "app_snapshot") return state;
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "المفضلة" }));
    await userEvent.click(await screen.findByRole("button", { name: "إزالة" }));
    expect(
      await screen.findByText("إزالة هذه الصفحة من المفضلة"),
    ).toBeInTheDocument();
    expect(mocks.command).toHaveBeenCalledWith("bookmark_remove", { id: 8 });
    expect(
      mocks.command.mock.calls.some((c) => c[0] === "approval_resolve"),
    ).toBe(false);
  });
  it("routes key removal to approval without claiming it was removed", async () => {
    mocks.native.mockReturnValue(true);
    state.settings.aiConfigured = true;
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "ai_key_delete")
        state.approvals = [
          {
            id: "k1",
            kind: "destructive",
            summary: "Remove the saved AI API key",
            origin: "local",
            payload:
              "The saved credential will be removed from the OS keychain.",
          },
        ];
      if (name === "app_snapshot") return state;
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "الإعدادات" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "إزالة المفتاح" }),
    );
    expect(
      await screen.findByText("إزالة مفتاح الذكاء الاصطناعي المحفوظ"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("سيُحذف المفتاح المحفوظ من خزنة مفاتيح نظام التشغيل."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("أُزيل مفتاح الذكاء الاصطناعي."),
    ).not.toBeInTheDocument();
    expect(
      mocks.command.mock.calls.some((c) => c[0] === "approval_resolve"),
    ).toBe(false);
  });
});
