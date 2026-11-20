import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("./chatTransport",()=>({askChat:(args:Record<string,unknown>)=>mocks.command("ai_ask",args)}));
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
  it("offers Claude and a custom endpoint with model and protocol", async () => {
    mocks.native.mockReturnValue(true);
    render(<App/>);
    await userEvent.click(screen.getByRole("button", {name:"الإعدادات"}));
    await userEvent.click(screen.getByRole("radio", {name:"Claude"}));
    expect(screen.getByLabelText("اسم النموذج")).toHaveValue("claude-sonnet-5-5");
    expect(screen.getByLabelText("معرّف مساحة العمل (اختياري)")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("مفتاح API"), "synthetic-claude-key");
    fireEvent.submit(screen.getByLabelText("مفتاح API").closest("form")!);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("ai_key_save", {key:"synthetic-claude-key",provider:"claude",model:"claude-sonnet-5-5",workspace:""}));
    await userEvent.click(screen.getByRole("radio", {name:"مخصّص"}));
    expect(screen.getByLabelText("مفتاح API")).toHaveValue("");
    await userEvent.type(screen.getByLabelText("اسم النموذج"), "my-model");
    await userEvent.type(screen.getByLabelText("عنوان API الكامل"), "https://example.com/v1/chat/completions");
    await userEvent.type(screen.getByLabelText("مفتاح API"), "synthetic-custom-key");
    fireEvent.submit(screen.getByLabelText("مفتاح API").closest("form")!);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("ai_key_save", {key:"synthetic-custom-key",provider:"custom",model:"my-model",endpoint:"https://example.com/v1/chat/completions",protocol:"openai"}));
  });
  it("saves a key with the selected provider and clears keys on provider changes", async () => {
    mocks.native.mockReturnValue(true);
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "الإعدادات" }));
    const key = await screen.findByLabelText("مفتاح API");
    await userEvent.type(key, "synthetic-openai-key");
    await userEvent.click(screen.getByRole("radio", { name: "DeepSeek" }));
    expect(key).toHaveValue("");
    await userEvent.type(key, "synthetic-deepseek-key");
    fireEvent.submit(key.closest("form")!);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("ai_key_save", { key: "synthetic-deepseek-key", provider: "deepseek", model: "deepseek-flash" }));
    await waitFor(() => expect(key).toHaveValue(""));
  });
  it("hides browser controls in fullscreen and restores them on exit", async () => {
    mocks.native.mockReturnValue(true);
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "window_fullscreen_toggle") state.fullscreen = !state.fullscreen;
      return name === "app_snapshot" ? structuredClone(state) : undefined;
    });
    render(<App/>);
    await userEvent.click(screen.getByRole("button", {name:"المساعد الذكي"}));
    fireEvent.keyDown(document, {key:"F11"});
    await waitFor(() => expect(screen.queryByRole("banner")).not.toBeInTheDocument());
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(document.querySelector("#assistant-panel")).toBeNull();
    expect(document.querySelector(".app-shell")).toHaveClass("immersive");
    fireEvent.keyDown(document, {key:"l",ctrlKey:true});
    await waitFor(() => expect(screen.getByRole("banner")).toBeVisible());
    fireEvent.keyDown(document, {key:"Escape"});
    await waitFor(() => expect(screen.queryByRole("banner")).not.toBeInTheDocument());
    fireEvent.keyDown(document, {key:"F11"});
    await waitFor(() => expect(screen.getByRole("banner")).toBeVisible());
    expect(screen.getByRole("navigation")).toBeVisible();
    expect(document.querySelector("#assistant-panel")).not.toBeNull();
  });

  it("keeps tabs and controls in full screen where the platform does not use immersive mode", async () => {
    mocks.native.mockReturnValue(true);
    state.fullscreen = true;
    (state.settings as {fullscreenImmersive?: boolean}).fullscreenImmersive = false;
    render(<App/>);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("app_snapshot", expect.anything()));
    expect(screen.getByRole("banner")).toBeVisible();
    expect(screen.getByRole("tablist")).toBeVisible();
    expect(document.querySelector(".app-shell")).not.toHaveClass("immersive");
  });

  it("draws its own window buttons in full screen where the tabs are the title bar", async () => {
    mocks.native.mockReturnValue(true);
    (state.settings as {fullscreenImmersive?: boolean; titlebarOverlay?: boolean}).fullscreenImmersive = false;
    (state.settings as {titlebarOverlay?: boolean}).titlebarOverlay = true;
    render(<App/>);
    await waitFor(() => expect(document.querySelector(".app-shell")).toHaveClass("window-buttons"));
    expect(document.querySelector(".own-window-buttons")).toBeNull();
    cleanup();
    state.fullscreen = true;
    render(<App/>);
    fireEvent.click(await screen.findByRole("button", {name:"إغلاق النافذة"}));
    expect(mocks.command).toHaveBeenCalledWith("window_close");
    fireEvent.click(screen.getByRole("button", {name:"الخروج من ملء الشاشة"}));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("window_fullscreen_toggle", undefined));
    expect(document.querySelector(".app-shell")).toHaveClass("window-buttons");
  });

  it("moves the window from empty title bar space only where the tabs are the title bar", async () => {
    mocks.native.mockReturnValue(true);
    render(<App/>);
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("app_snapshot", expect.anything()));
    fireEvent.mouseDown(screen.getByRole("banner"), {button:0});
    expect(mocks.command).not.toHaveBeenCalledWith("window_drag", expect.anything());
    cleanup();
    (state.settings as {titlebarOverlay?: boolean}).titlebarOverlay = true;
    render(<App/>);
    await waitFor(() => expect(document.querySelector(".app-shell")).toHaveClass("window-buttons"));
    fireEvent.mouseDown(screen.getByRole("tablist"), {button:0, detail:1});
    expect(mocks.command).toHaveBeenCalledWith("window_drag", {zoom:false});
    fireEvent.mouseDown(screen.getByRole("banner"), {button:0, detail:2});
    expect(mocks.command).toHaveBeenCalledWith("window_drag", {zoom:true});
    mocks.command.mockClear();
    fireEvent.mouseDown(screen.getByRole("button", {name:"English"}), {button:0});
    expect(mocks.command).not.toHaveBeenCalledWith("window_drag", expect.anything());
  });

  it("toggles native full screen with F11 and ignores repeats and modified keys", async () => {
    mocks.native.mockReturnValue(true);
    render(<App/>);
    fireEvent.keyDown(document, {key:"F11"});
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("window_fullscreen_toggle", undefined));
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("app_snapshot", expect.anything()));
    mocks.command.mockClear();
    fireEvent.keyDown(document, {key:"F11", repeat:true});
    fireEvent.keyDown(document, {key:"F11", ctrlKey:true});
    fireEvent.keyDown(document, {key:"F11", shiftKey:true});
    expect(mocks.command).not.toHaveBeenCalledWith("window_fullscreen_toggle", undefined);
    fireEvent.keyDown(document, {key:"F11"});
    await waitFor(() => expect(mocks.command).toHaveBeenCalledWith("window_fullscreen_toggle", undefined));
  });

  it("saves the Windows password preference through the native host", async () => {
    mocks.native.mockReturnValue(true);
    state.settings.passwordSaveSupported = true;
    state.settings.passwordSave = false;
    mocks.command.mockImplementation(async (name: string, args?: {passwordSave?: boolean}) => {
      if (name === "settings_update") state.settings.passwordSave = args?.passwordSave;
      return name === "app_snapshot" ? structuredClone(state) : undefined;
    });
    render(<App/>);
    await userEvent.click(screen.getByRole("button", {name:"الإعدادات"}));
    const toggle = await screen.findByRole("switch", {name:"السماح بحفظ كلمات المرور"});
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveTextContent("غير مفعّل");
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(toggle).toHaveTextContent("— مفعّل");
    expect(screen.getByText("تم تفعيل السماح بحفظ كلمات المرور.")).toBeInTheDocument();
    expect(mocks.command).toHaveBeenCalledWith("settings_update", {locale:"ar",passwordSave:true});
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
  });
  it("does not offer password saving on unsupported platforms", async () => {
    render(<App/>);
    await userEvent.click(screen.getByRole("button", {name:"الإعدادات"}));
    expect(screen.queryByRole("switch", {name:"السماح بحفظ كلمات المرور"})).not.toBeInTheDocument();
  });

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
  it("persists sidebar size and exposes About below Settings without extra menus", async () => {
    localStorage.setItem("labeeb.sidebar-mode", "hidden");
    const view = render(<App />);
    expect(screen.getByRole("navigation")).toHaveClass("compact");
    await userEvent.click(screen.getByRole("button", {name:"توسيع القائمة"}));
    view.unmount();
    render(<App />);
    const nav = screen.getByRole("navigation");
    expect(nav).toHaveClass("expanded");
    const buttons = within(nav).getAllByRole("button");
    expect(buttons.slice(-2).map(b => b.getAttribute("aria-label"))).toEqual(["الإعدادات", "عن لبيب"]);
    expect(within(nav).queryByRole("button", {name:/إخفاء|المزيد|التشخيص/})).not.toBeInTheDocument();
    expect(within(nav).getByRole("button", {name:"Viora - يوتيوب بدون إعلانات"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name:"عن لبيب"}));
    expect(screen.getByRole("heading", {name:"شايع الشايع"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", {name:"الإعدادات"}));
    expect(within(screen.getByRole("main")).queryByRole("button", {name:"عن لبيب"})).not.toBeInTheDocument();
  });
  it("switches languages next to the logo and removes the closed assistant column", async () => {
    render(<App />);
    const language = within(screen.getByRole("banner")).getByRole("group", {name:"لغة الواجهة"});
    await userEvent.click(within(language).getByRole("button", {name:"English"}));
    expect(document.documentElement.dir).toBe("ltr");
    await userEvent.click(within(language).getByRole("button", {name:"عربي"}));
    expect(document.documentElement.dir).toBe("rtl");
    const toggle = screen.getByRole("button", {name:"المساعد الذكي"});
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("complementary");
    await userEvent.click(within(panel).getByRole("button", {name:"إغلاق"}));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("main").parentElement).toHaveClass("assistant-closed");
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
    expect(!!indicator.querySelector(".lucide-lock")).toBe(locked);
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
    await userEvent.click(screen.getByRole("button", { name: "English" }));
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
  it("does not expose automation or approvals in navigation", async () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "الموافقات" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "الأتمتة" })).not.toBeInTheDocument();
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
      provider: "openai",
      model: "gpt-4.1-mini",
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
      history: [],
    });
  });
  it("opens assistant links in Labeeb without closing the conversation", async () => {
    mocks.native.mockReturnValue(true);
    state.settings.aiConfigured = true;
    mocks.command.mockImplementation(async (name: string) => name === 'app_snapshot' ? state : name === 'ai_ask' ? {text:'[صفحة المثال](https://example.com/guide)'} : undefined);
    render(<App/>);
    await userEvent.click(screen.getByRole('button',{name:'المساعد الذكي'}));
    fireEvent.change(screen.getByRole('textbox',{name:'اسأل المساعد…'}),{target:{value:'أعطني الرابط'}});
    fireEvent.click(screen.getByRole('button',{name:'إرسال'}));
    const link = await screen.findByRole('link',{name:'صفحة المثال'});
    fireEvent.click(link);
    await waitFor(()=>expect(mocks.command).toHaveBeenCalledWith('tab_create',{url:'https://example.com/guide'}));
    expect(screen.getByRole('complementary',{name:'المساعد الذكي'})).toBeInTheDocument();
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
    await waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
    await act(async () => oldResolve(old));
    expect(document.documentElement.lang).toBe("ar");
  });
  it("lets Escape cancel history deletion before executing the command", async () => {
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
  it("removes a bookmark directly and stays on bookmarks", async () => {
    mocks.native.mockReturnValue(true);
    state.bookmarks = [{ id: 8, title: "Example", url: "https://example.com" }];
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "bookmark_remove") state.bookmarks = [];
      if (name === "app_snapshot") return state;
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "المفضلة" }));
    await userEvent.click(await screen.findByRole("button", { name: "إزالة" }));
    await waitFor(() => expect(screen.queryByText("Example")).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "المفضلة" })).toBeInTheDocument();
    expect(mocks.command).toHaveBeenCalledWith("bookmark_remove", { id: 8 });
  });
  it("removes the key directly and updates settings", async () => {
    mocks.native.mockReturnValue(true);
    state.settings.aiConfigured = true;
    mocks.command.mockImplementation(async (name: string) => {
      if (name === "ai_key_delete") state.settings.aiConfigured = false;
      if (name === "app_snapshot") return state;
    });
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "الإعدادات" }));
    await userEvent.click(await screen.findByRole("button", { name: "إزالة المفتاح" }));
    expect(await screen.findByText("أُزيل مفتاح الذكاء الاصطناعي.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إزالة المفتاح" })).not.toBeInTheDocument();
    expect(mocks.command).toHaveBeenCalledWith("ai_key_delete", undefined);
  });
});
it('moves native page bounds when language flips with the assistant open', async () => {
  mocks.native.mockReturnValue(true);
  state.tabs = [{id:'layout',title:'Layout page',url:'https://example.com/'}];
  state.activeTabId = 'layout';
  mocks.command.mockImplementation(async (name: string, args?: {locale?: 'ar' | 'en'}) => {
    if (name === 'settings_update' && args?.locale) state.settings.locale = args.locale;
    return name === 'app_snapshot' ? structuredClone(state) : undefined;
  });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const x = this.closest('.app-shell')?.getAttribute('dir') === 'rtl' ? 380 : 72;
    return {x,y:100,width:700,height:600,top:100,left:x,right:x+700,bottom:700,toJSON:()=>({})};
  });
  try {
    render(<App/>);
    await screen.findByRole('tab',{name:'Layout page'});
    await userEvent.click(screen.getByRole('button',{name:'المساعد الذكي'}));
    const panel = document.querySelector('#assistant-panel');
    expect(panel).not.toBeNull();
    for (const [language, x] of [['English',72],['عربي',380]] as const) {
      mocks.command.mockClear();
      await userEvent.click(screen.getByRole('button',{name:language}));
      await waitFor(() => expect(mocks.command).toHaveBeenCalledWith('browser_bounds',expect.objectContaining({x,width:700,visible:true})));
      expect(document.querySelector('#assistant-panel')).toBe(panel);
      expect(document.querySelector('.assistant-toggle')).toHaveAttribute('aria-expanded','true');
    }
  } finally { rect.mockRestore(); }
});
it('removes agent permissions from model settings', async () => {
  mocks.native.mockReturnValue(true);
  render(<App/>);
  await userEvent.click(screen.getByRole('button',{name: '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a'}));
  expect(document.querySelector('.agent-consent')).toBeNull();
});
