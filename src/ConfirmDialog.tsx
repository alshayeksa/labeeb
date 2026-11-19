import { useEffect, useId, useRef } from "react";
import { Trash2 } from "./icons";

/**
 * Confirmation for a destructive action. It names the item, says what will
 * happen, labels the action with its verb, and keeps Cancel as the safe default:
 * Cancel has initial focus, and Escape or a click outside both cancel.
 */
export default function ConfirmDialog({ title, itemName, detail, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: {
  title: string; itemName?: string; detail: string; confirmLabel: string; cancelLabel: string;
  busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId(), detailId = useId();
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  const nativeModal = typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal === "function";
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    const previous = returnFocus.current;
    const panel = dialog.current;
    if (nativeModal) panel?.showModal();
    else { panel?.setAttribute("open", ""); cancelButton.current?.focus(); }
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    if (!nativeModal) document.addEventListener("keydown", handler, true);
    return () => { document.removeEventListener("keydown", handler, true); if (nativeModal && panel?.open) panel.close(); previous?.focus?.(); };
  }, [nativeModal]);
  return (
    <div className={nativeModal ? "native-modal-host" : "modal-backdrop"} onMouseDown={event => { if (event.target === event.currentTarget) onCancel(); }}>
      <dialog ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={detailId} className="modal confirm-dialog"
        onCancel={event => { event.preventDefault(); onCancel(); }}
        onClick={event => { if (nativeModal && event.target === event.currentTarget) { const box=event.currentTarget.getBoundingClientRect(); if(event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onCancel(); } }}>
        <span className="confirm-icon" aria-hidden="true"><Trash2 size={22} /></span>
        <h2 id={titleId}>{title}</h2>
        {itemName && <p className="confirm-item" dir="auto" title={itemName}>{itemName}</p>}
        <p id={detailId}>{detail}</p>
        <div className="button-row">
          <button type="button" className="button danger" disabled={busy} onClick={onConfirm}><Trash2 size={15} />{confirmLabel}</button>
          <button ref={cancelButton} type="button" className="button" autoFocus onClick={onCancel}>{cancelLabel}</button>
        </div>
      </dialog>
    </div>
  );
}
