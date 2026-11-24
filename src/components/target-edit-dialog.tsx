"use client";

import { useRouter } from "next/navigation";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { changeTarget } from "@/app/target-actions";
import type { ManagedTarget } from "@/domain/targets";
import { TargetForm } from "./target-form";

export function EditTargetButton({
  target,
  scope,
  label = "Ubah target",
  heading = false,
}: {
  target: ManagedTarget;
  scope: "demo" | "business";
  label?: string;
  heading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const router = useRouter();
  useLayoutEffect(() => {
    if (!open || !dialog.current || dialog.current.open) return;
    dialog.current.showModal();
    dialog.current.querySelector("select")?.focus({ preventScroll: true });
  }, [open]);
  function dismiss() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  const editButton = (
    <button
      ref={trigger}
      type="button"
      aria-haspopup="dialog"
      className={heading ? "target-title-button" : "button outline"}
      aria-label={heading ? "Ubah " + label.toLowerCase() : undefined}
      title={heading ? "Ubah target" : undefined}
      data-target-editor
      onClick={() => {
        setNotice("");
        setOpen(true);
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      className={
        heading
          ? "target-editor-control target-heading-control"
          : "target-editor-control"
      }
    >
      {heading ? <h3>{editButton}</h3> : editButton}
      {open && (
        <dialog
          ref={dialog}
          className="target-edit-dialog"
          aria-labelledby={id}
          onCancel={(event) => {
            event.preventDefault();
            if (
              !dialog.current?.querySelector(
                'form[aria-busy="true"], .target-operation button:disabled',
              )
            )
              dismiss();
          }}
        >
          <TargetForm
            id={target.id}
            target={target}
            action={changeTarget.bind(null, scope)}
            back=""
            titleId={id}
            onCancel={dismiss}
            onSaved={(result) => {
              setNotice(
                result === "dihapus" ? "Target dihapus." : "Target tersimpan.",
              );
              dismiss();
              router.refresh();
            }}
          />
        </dialog>
      )}
      <p aria-live="polite" className="target-edit-notice">
        {notice}
      </p>
    </div>
  );
}
