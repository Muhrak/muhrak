"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./parts";

/**
 * A modal "are you sure" for the Seller Centre (native <dialog>: focus is
 * kept inside, Escape and a click on the backdrop cancel).
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmed = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={() => (confirmed.current ? onConfirm() : onCancel())}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="m-auto w-[calc(100vw-32px)] max-w-[460px] rounded-[24px] border border-black/8 bg-panel p-0 text-text-strong shadow-[0_30px_80px_rgba(10,11,18,0.18)] backdrop:bg-[rgba(10,11,18,0.45)]"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-xl leading-[normal] font-medium">{title}</h2>
        <div className="flex flex-col gap-2.5 text-[15px] leading-normal text-text-body">{children}</div>
        <div className="flex flex-wrap justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className={cn("h-11 rounded-full border border-line px-5 text-[15px] font-medium text-text-strong hover:bg-black/4", focusRing)}
          >
            Cancel
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              confirmed.current = true;
              ref.current?.close();
            }}
            className={cn("h-11 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90", focusRing)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
