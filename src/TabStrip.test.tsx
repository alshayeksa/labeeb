import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TabStrip from "./TabStrip";
import { translate } from "./i18n";
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
