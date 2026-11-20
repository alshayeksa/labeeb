import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TabStrip from "./TabStrip";
import { translate } from "./i18n";
const command = vi.hoisted(() => vi.fn());
vi.mock("./bridge", async original => ({ ...(await original<typeof import("./bridge")>()), command }));
afterEach(cleanup);
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
