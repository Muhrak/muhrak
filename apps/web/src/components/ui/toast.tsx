"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Platform toasts (developer request, 17 Nov 2026): a short note after an
 * action ("Changes saved", "Request cancelled"). Dark card with a tone icon,
 * bottom centre on phones and bottom right on larger screens; up to three at
 * once; closes itself (4 s, errors 6 s) unless the pointer is on it.
 * Form errors stay next to the form; toasts are for results of actions.
 *
 * Usage: `const toast = useToast(); toast.success("Changes saved");`
 */
type Tone = "success" | "error" | "info";
type ToastInput = { title: string; description?: string };
type ToastItem = ToastInput & { id: number; tone: Tone };
type ToastApi = Record<Tone, (title: string, description?: string) => void>;

const noop = () => undefined;
const ToastContext = createContext<ToastApi>({ success: noop, error: noop, info: noop });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const api = useMemo<ToastApi>(() => {
    const show = (tone: Tone) => (title: string, description?: string) => {
      const id = ++nextId.current;
      setToasts((list) => [...list.slice(-2), { id, tone, title, description }]);
    };
    return { success: show("success"), error: show("error"), info: show("info") };
  }, []);

  return (
    <ToastContext value={api}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-center gap-2 font-portal sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onClose={dismiss} />
        ))}
      </section>
    </ToastContext>
  );
}

const TONE = {
  success: { icon: CircleCheck, className: "text-success" },
  error: { icon: CircleAlert, className: "text-sidebar-danger" },
  info: { icon: Info, className: "text-sky-sky" },
} as const;

function Toast({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onClose(item.id), item.tone === "error" ? 6000 : 4000);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.tone, onClose]);

  const { icon: ToneIcon, className } = TONE[item.tone];
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="toast-in pointer-events-auto flex w-full items-start gap-3 rounded-[14px] bg-ink py-3.5 pr-3 pl-4 text-white shadow-[0_12px_32px_rgba(10,11,18,0.28)] sm:w-[360px]"
    >
      <ToneIcon aria-hidden className={cn("mt-px size-[18px] shrink-0", className)} strokeWidth={2} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.35]">
        <p className="text-sm font-medium break-words">{item.title}</p>
        {item.description ? <p className="text-[13px] break-words text-white/65">{item.description}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onClose(item.id)}
        className="-my-1 flex size-7 shrink-0 items-center justify-center rounded-full text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/50"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
