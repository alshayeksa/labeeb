import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ConfirmDialog from "./ConfirmDialog";
afterEach(()=>{cleanup();vi.restoreAllMocks();});
const props={title:"Delete file",detail:"Deletes the saved file",confirmLabel:"Delete",cancelLabel:"Cancel",onConfirm:vi.fn()};
it("provides Escape and Tab fallback and returns focus to the trigger",()=>{
  const trigger=document.createElement("button");document.body.append(trigger);trigger.focus();
  const onCancel=vi.fn(); const view=render(<ConfirmDialog {...props} onCancel={onCancel}/>);
  expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  const cancel=screen.getByRole("button",{name:"Cancel"}); expect(cancel).toHaveFocus();
  fireEvent.keyDown(cancel,{key:"Tab"}); expect(screen.getByRole("button",{name:"Delete"})).toHaveFocus();
  fireEvent.keyDown(document,{key:"Escape"}); expect(onCancel).toHaveBeenCalledOnce();
  view.unmount();expect(trigger).toHaveFocus();trigger.remove();
});
it("uses native modal semantics when available and cancels through the native event",()=>{
  const show=vi.fn(function(this:HTMLDialogElement){this.setAttribute("open","");});
  const close=vi.fn(function(this:HTMLDialogElement){this.removeAttribute("open");});
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{value:show,configurable:true});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{value:close,configurable:true});
  try {
    const onCancel=vi.fn(); const view=render(<ConfirmDialog {...props} onCancel={onCancel}/>);
    expect(show).toHaveBeenCalledOnce();
    fireEvent(screen.getByRole("alertdialog"),new Event("cancel",{cancelable:true}));
    expect(onCancel).toHaveBeenCalledOnce();
    view.unmount();expect(close).toHaveBeenCalledOnce();
  } finally {
    Reflect.deleteProperty(HTMLDialogElement.prototype,"showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype,"close");
  }
});
