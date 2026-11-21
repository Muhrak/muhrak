import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A "tool" screen of the Buyer or Seller Centre (Messenger, Inquiries & RFQs,
 * RFQ Inbox): one panel that fills the screen, with no page scroll, a compact
 * title and description in its header and the content inside; lists and
 * details scroll on their own (developer rule, 21 Nov 2026).
 *
 * Heights: the Centre's main area has 30 px above and 28 px below on desktop
 * (56 px top bar + 24/28 px on phones); the Seller Centre is zoomed to 85%
 * on desktop, so its screen height is divided by 0.85.
 */
export function WorkspacePanel({
  side,
  title,
  description,
  actions,
  children,
}: {
  side: "buyer" | "seller";
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex h-[calc(100dvh-108px)] min-h-[520px] flex-col overflow-hidden rounded-[24px] bg-panel",
        side === "seller" ? "lg:h-[calc(100dvh/0.85-58px)]" : "lg:h-[calc(100dvh-58px)]",
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-5 py-3">
        <div className="flex min-w-0 flex-auto items-baseline gap-3">
          <h1 className="shrink-0 text-xl leading-[normal] font-medium tracking-[-0.01em] text-text-strong">{title}</h1>
          {description ? <p className="truncate text-[13px] text-text-muted max-sm:hidden">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** List on the left, detail on the right (phones: one at a time). Each side scrolls on its own. */
export function WorkspaceSplit({ list, detail, showDetail }: { list: ReactNode; detail: ReactNode; showDetail: boolean }) {
  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
      <aside className={cn("flex min-h-0 flex-col border-line lg:border-r", showDetail && "max-lg:hidden")}>{list}</aside>
      <div className={cn("min-h-0 min-w-0 overflow-y-auto", !showDetail && "max-lg:hidden")}>{detail}</div>
    </div>
  );
}

/** Small filter chips with counts ("All 3", "Unread 1"), for the top of a list. */
export function FilterChips<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { key: T; label: string; count?: number }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.key)}
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] leading-none font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40",
              active ? "bg-text-strong text-white" : "bg-surface text-text-strong hover:bg-black/6",
            )}
          >
            {item.label}
            {item.count !== undefined ? <span className={cn("text-xs font-normal", active ? "text-white/70" : "text-text-muted")}>{item.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact header buttons for a workspace (outline or solid), as links. */
export const workspaceButton = {
  outline:
    "flex h-9 items-center rounded-full border border-line px-4 text-sm font-medium text-text-strong hover:bg-black/4 outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40",
  solid:
    "flex h-9 items-center rounded-full bg-side-accent px-4 text-sm font-semibold text-white hover:opacity-90 outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40",
};
