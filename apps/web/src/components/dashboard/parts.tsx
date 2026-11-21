import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/layout/icon";
import { Thumb } from "@/features/rfq/parts";
import { cn } from "@/lib/utils";

/** Building blocks of "Seller – Dashboard (Light)", shared by both dashboards. */

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40";

export function PageHeader({ title, meta, badge, actions }: { title: string; meta?: string; badge: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="text-[28px] leading-[normal] font-medium tracking-[-0.02em] break-words text-text-strong sm:text-[40px]">{title}</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          {meta ? <p className="min-w-0 truncate text-base leading-[normal] text-text-muted">{meta}</p> : null}
          {badge}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}

/** Dark pill with a dot: "Seller account" / "Buyer account". */
export function AccountBadge({ label, dotClass }: { label: string; dotClass: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-sidebar-bg py-1 pr-3 pl-2.5 text-[13px] leading-[normal] font-medium text-white">
      <span aria-hidden className={cn("size-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

const pillBase = "flex h-[52px] items-center justify-center gap-2 rounded-full px-7 text-base leading-[normal] font-semibold whitespace-nowrap transition-opacity";

/** `onDark`: white outline, for the black cards. */
export function OutlinePillLink({ href, onDark = false, children }: { href: string; onDark?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        pillBase,
        onDark
          ? "border-[1.5px] border-white/45 text-white outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/40"
          : cn(focusRing, "border-[1.5px] border-text-strong text-text-strong hover:bg-black/4"),
      )}
    >
      {children}
    </Link>
  );
}

/** `accent` is the side colour: orange for sellers, navy for buyers. */
export function SolidPillLink({ href, icon, children }: { href: string; icon?: IconName; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(pillBase, focusRing, "bg-side-accent text-white hover:opacity-90")}
    >
      {icon ? <Icon name={icon} className="size-[18px]" /> : null}
      {children}
    </Link>
  );
}

export function StatCards({ stats, fit }: { stats: { label: string; value: number; note: string }[]; fit?: boolean }) {
  return (
    <div className="grid shrink-0 gap-5 sm:grid-cols-3">
      {stats.map((stat) => (
        <div key={stat.label} className={cn("flex flex-col gap-1 rounded-[24px] bg-panel px-6 py-[22px] leading-[normal]", fit && "lg:py-[18px]")}>
          <p className="text-[15px] font-medium text-text-body">{stat.label}</p>
          <p className={cn("text-[52px] font-light tracking-[-0.03em] text-text-strong", fit && "lg:text-[44px]")}>{stat.value}</p>
          <p className="text-sm text-text-subtle">{stat.note}</p>
        </div>
      ))}
    </div>
  );
}

/** White panel with a header link and an empty state, e.g. "Quote requests · View all →". */
export function EmptyPanel({
  title,
  link,
  icon,
  emptyTitle,
  emptyText,
  fit,
}: {
  title: string;
  link: { href: string; label: string };
  icon: IconName;
  emptyTitle: string;
  emptyText: string;
  /** Desktop: shrink to the space left on a one-screen dashboard. */
  fit?: boolean;
}) {
  return (
    <section aria-label={title} className={cn("flex min-h-[260px] flex-1 flex-col rounded-[24px] bg-panel px-6 py-[22px]", fit && "lg:min-h-0 lg:overflow-hidden")}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl leading-[normal] font-medium tracking-[-0.01em] text-text-strong">{title}</h2>
        <Link href={link.href} className={cn("flex items-center gap-1.5 rounded-sm text-[15px] leading-[normal] font-medium text-text-strong hover:underline", focusRing)}>
          {link.label}
          <Icon name="arrow-right" className="size-[15px]" />
        </Link>
      </div>
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center", fit && "lg:py-3")}>
        <span className="mb-1 flex size-[52px] items-center justify-center rounded-full bg-surface text-text-body">
          <Icon name={icon} className="size-[22px]" />
        </span>
        <p className="text-[17px] leading-[normal] font-medium text-text-strong">{emptyTitle}</p>
        <p className="text-[15px] leading-[normal] text-text-muted">{emptyText}</p>
      </div>
    </section>
  );
}

export function PanelRow({ children, fit }: { children: ReactNode; fit?: boolean }) {
  return <div className={cn("flex flex-1 flex-col gap-5 lg:flex-row", fit && "lg:min-h-0")}>{children}</div>;
}

/** A dashboard panel with rows (the filled version of EmptyPanel). */
export function ListPanel({ title, link, children, fit }: { title: string; link: { href: string; label: string }; children: ReactNode; fit?: boolean }) {
  return (
    <section aria-label={title} className={cn("flex min-h-[260px] flex-1 flex-col rounded-[24px] bg-panel px-6 py-[22px]", fit && "lg:min-h-0")}>
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl leading-[normal] font-medium tracking-[-0.01em] text-text-strong">{title}</h2>
        <Link
          href={link.href}
          className="flex items-center gap-1.5 rounded-sm text-[15px] leading-[normal] font-medium text-text-strong outline-none hover:underline focus-visible:ring-3 focus-visible:ring-brand-blue/40"
        >
          {link.label}
          <Icon name="arrow-right" className="size-[15px]" />
        </Link>
      </div>
      {/* One-screen dashboard: a long list scrolls inside the panel, not the page. */}
      <ul className={cn("mt-3 flex flex-col", fit && "lg:min-h-0 lg:overflow-y-auto")}>{children}</ul>
    </section>
  );
}

export function ListRow({ href, photo, title, meta, side }: { href: string; photo: string | null; title: string; meta: string; side: ReactNode }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={href} className="flex items-center gap-3.5 rounded-[12px] py-3 outline-none hover:bg-surface/60 focus-visible:ring-3 focus-visible:ring-brand-blue/40">
        <Thumb src={photo} size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-1 leading-[normal]">
          <span className="truncate text-[15px] font-medium text-text-strong">{title}</span>
          <span className="truncate text-[13px] text-text-muted">{meta}</span>
        </span>
        {side}
      </Link>
    </li>
  );
}
