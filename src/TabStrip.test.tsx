import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TabStrip from "./TabStrip";
import { translate } from "./i18n";
const command = vi.hoisted(() => vi.fn());
vi.mock("./bridge", async original => ({ ...(await original<typeof import("./bridge")>()), command }));
afterEach(cleanup);
// jsdom has no PointerEvent, so pointer events are sent as mouse events carrying the same fields.
const pointer = (target: Element | Window, type: string, init: MouseEventInit & {pointerId?: number}) => fireEvent(target, new MouseEvent(type, {bubbles:true, cancelable:true, ...init}));
it.each(["ar", "en"] as const)("navigates tabs in %s without activating on arrow keys", locale => {
  const onSelect=vi.fn(), onClose=vi.fn();
  render(<TabStrip tabs={["a","b","c"].map(id=>({id,title:id,url:`https://${id}.test`}))} activeId="b" locale={locale} t={key=>translate(locale,key)} onSelect={onSelect} onClose={onClose} onNew={()=>{}} showingBrowser />);
  const tabs=screen.getAllByRole("tab");
  tabs[1].focus(); fireEvent.keyDown(tabs[1],{key:"ArrowRight"});
  expect(tabs[locale==="ar" ? 0 : 2]).toHaveFocus();
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.keyDown(document.activeElement!,{key:"Home"}); expect(tabs[0]).toHaveFocus();
  fireEvent.keyDown(tabs[0],{key:"End"}); expect(tabs[2]).toHaveFocus();
  fireEvent.keyDown(tabs[2],{key:"Delete"}); expect(onClose).toHaveBeenCalledWith("c"); expect(tabs[1]).toHaveFocus();
});

it("shows a site's icon once per site, a spinner while loading, and the globe otherwise", async () => {
  command.mockResolvedValue("data:image/png;base64,AAAA");
  const tabs = [
    {id:"a",title:"A",url:"https://one.test/a",icon:"one.test"},
    {id:"b",title:"B",url:"https://one.test/b",icon:"one.test"},
    {id:"c",title:"C",url:"https://two.test/",icon:"two.test",loading:true},
    {id:"d",title:"D",url:"https://three.test/"},
  ];
  const {container} = render(<TabStrip tabs={tabs} activeId="a" locale="en" t={key=>translate("en",key)} onSelect={()=>{}} onClose={()=>{}} onNew={()=>{}} showingBrowser />);
  await waitFor(() => expect(container.querySelectorAll("img.tab-icon")).toHaveLength(2));
  expect(container.querySelector("img.tab-icon")).toHaveAttribute("src", "data:image/png;base64,AAAA");
  expect(command.mock.calls.filter(([name, args]) => name === "favicon" && args.site === "one.test")).toHaveLength(1);
  const icons = [...container.querySelectorAll('[role="tab"]')].map(tab => tab.querySelector(".tab-icon")!);
  expect(icons[2].tagName).toBe("svg");
  expect(icons[2]).toHaveClass("spin");
  expect(icons[3].tagName).toBe("svg");
  fireEvent.error(icons[0]);
  expect(container.querySelectorAll("img.tab-icon")).toHaveLength(1);
});

it.each(["en", "ar"] as const)("drags a tab past its neighbours to reorder it in %s without selecting it", locale => {
  const onMove=vi.fn(), onSelect=vi.fn();
  const {container} = render(<TabStrip tabs={["a","b","c"].map(id=>({id,title:id,url:`https://${id}.test`}))} activeId="a" locale={locale} t={key=>translate(locale,key)} onSelect={onSelect} onClose={()=>{}} onMove={onMove} onNew={()=>{}} showingBrowser />);
  const items = [...container.querySelectorAll<HTMLElement>(".tab")];
  // Three 100px tabs laid out in reading order: left to right in English, right to left in Arabic.
  items.forEach((item, index) => { const left = locale === "ar" ? 200 - index * 100 : index * 100;
    item.getBoundingClientRect = () => ({left, right:left+100, width:100, top:0, bottom:32, height:32, x:left, y:0, toJSON(){}}); });
  const start = locale === "ar" ? 250 : 50, end = locale === "ar" ? 20 : 280;
  pointer(items[0], "pointerdown", {button:0, clientX:start, pointerId:1});
  pointer(window, "pointermove", {clientX:start + (end > start ? 3 : -3)});
  expect(container.querySelector(".tab-strip")).not.toHaveClass("reordering");
  pointer(window, "pointermove", {clientX:end});
  expect(container.querySelector(".tab-strip")).toHaveClass("reordering");
  expect(items[0]).toHaveClass("moving");
  expect(items[1].style.transform).toBe(`translateX(${locale === "ar" ? 100 : -100}px)`);
  pointer(window, "pointerup", {clientX:end});
  fireEvent.click(items[0].querySelector("button")!);
  expect(onMove).toHaveBeenCalledWith("a", 2);
  expect(onSelect).not.toHaveBeenCalled();
  expect([...container.querySelectorAll('[role="tab"]')].map(tab => tab.textContent)).toEqual(["b","c","a"]);
  // An ordinary click still selects.
  pointer(items[1], "pointerdown", {button:0, clientX:150, pointerId:2});
  pointer(window, "pointerup", {clientX:150});
  fireEvent.click(items[1].querySelector("button")!);
  expect(onSelect).toHaveBeenCalledWith("b");
  expect(onMove).toHaveBeenCalledTimes(1);
});

it("moves the focused tab with Ctrl+Shift+PageDown and stops at the ends", () => {
  const onMove=vi.fn();
  render(<TabStrip tabs={["a","b"].map(id=>({id,title:id,url:`https://${id}.test`}))} activeId="a" locale="en" t={key=>translate("en",key)} onSelect={()=>{}} onClose={()=>{}} onMove={onMove} onNew={()=>{}} showingBrowser />);
  const first=screen.getAllByRole("tab")[0];
  fireEvent.keyDown(first,{key:"PageUp",ctrlKey:true,shiftKey:true});
  expect(onMove).not.toHaveBeenCalled();
  fireEvent.keyDown(first,{key:"PageDown",ctrlKey:true,shiftKey:true});
  expect(onMove).toHaveBeenCalledWith("a", 1);
});
