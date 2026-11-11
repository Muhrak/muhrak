"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCurrentUser, useSignOut } from "@/features/auth/hooks";
import { HOME_PATH, type PortalSide } from "@/features/auth/paths";
import { initials } from "@/features/auth/user-display";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import { isGroup, PORTAL_NAV, type NavGroup, type NavLink } from "./portal-nav";

/**
 * "Buyer Sidebar" / "Seller Sidebar" from Figma. Dark navy in the light
 * theme too, as in "Seller – Dashboard (Light)". The two sides differ in
 * brand gradient, item size and grouping; see the `look` table below.
 */

const look = {
  buyer: {
    title: "Buyer Centre",
    gradient: "bg-buyer-gradient",
    padding: "pt-7 pb-6",
    item: "py-3 text-[15px]",
    activeDot: "bg-white",
    avatar: "bg-buyer-gradient",
    accountCard: "border border-white/9 bg-linear-to-b from-white/5 to-white/2",
    accountLabel: "Buyer account",
  },
  seller: {
    title: "Seller Centre",
    gradient: "bg-seller-gradient",
    padding: "py-6",
    item: "py-[7px] text-sm",
    activeDot: "bg-success",
    avatar: "bg-seller-orange",
    accountCard: "bg-sidebar-card",
    accountLabel: "Seller account",
  },
} as const;

export function PortalSidebar({ side, onNavigate }: { side: PortalSide; onNavigate?: () => void }) {
  const style = look[side];
  const pathname = usePathname();
  const user = useCurrentUser();
  const signOut = useSignOut();
  const isActive = (slug: string) => pathname === `/${side}/${slug}` || pathname.startsWith(`/${side}/${slug}/`);

  return (
    <div className={cn("flex h-full flex-col gap-1 overflow-y-auto border-r border-sidebar-edge bg-sidebar-bg px-[18px] font-portal", style.padding)}>
      <div className="flex flex-col gap-2 px-2.5 pb-[30px]">
        <Link
          href={HOME_PATH[side]}
          onClick={onNavigate}
          aria-label={`Muhrak ${style.title}`}
          className="flex w-fit rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <Image src="/portal/muhrak-logo-white.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
        </Link>
        <p className={cn("w-fit bg-clip-text text-sm leading-[1.2] font-extrabold text-transparent italic", style.gradient)}>
          {style.title}
        </p>
      </div>

      <nav aria-label={style.title} className="flex flex-col gap-1">
        {PORTAL_NAV[side].map((entry, index) =>
          isGroup(entry) ? (
            entry.collapsible ? (
              <CollapsibleGroup key={entry.label} group={entry} side={side} itemClass={style.item} isActive={isActive} onNavigate={onNavigate} />
            ) : (
              <section key={entry.label} aria-label={entry.label} className="flex flex-col">
                <h2
                  className={cn(
                    "pl-3.5 text-[11px] leading-[1.2] font-medium tracking-[0.08em] text-sidebar-group uppercase",
                    index === 0 ? "py-1" : "pt-3 pb-1",
                  )}
                >
                  {entry.label}
                </h2>
                {entry.items.map((link) => (
                  <NavItem
                    key={link.slug}
                    link={link}
                    side={side}
                    className={style.item}
                    active={isActive(link.slug)}
                    dotClass={style.activeDot}
                    onNavigate={onNavigate}
                  />
                ))}
              </section>
            )
          ) : (
            <NavItem
              key={entry.slug}
              link={entry}
              side={side}
              className={style.item}
              active={isActive(entry.slug)}
              dotClass={style.activeDot}
              onNavigate={onNavigate}
            />
          ),
        )}
      </nav>

      <div className="min-h-6 flex-1" />

      <div className={cn("flex items-center gap-3 rounded-[20px] p-3.5", style.accountCard)}>
        <span
          aria-hidden
          className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white", style.avatar)}
        >
          {user ? initials(user.fullName) : ""}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.2]">
          <span className="truncate text-sm font-semibold text-white">{user?.fullName}</span>
          <span className="truncate text-[13px] text-sidebar-meta">{style.accountLabel}</span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => void signOut(side)}
        className={cn(
          "flex w-full items-center gap-3 rounded-full px-3.5 text-left leading-[1.2] text-sidebar-danger outline-none hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-white/30",
          style.item,
        )}
      >
        <Icon name="log-out" className="size-[18px]" />
        Log out
      </button>
    </div>
  );
}

function NavItem({
  link,
  side,
  className,
  active,
  dotClass,
  nested,
  onNavigate,
}: {
  link: NavLink;
  side: PortalSide;
  className: string;
  active: boolean;
  dotClass: string;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={`/${side}/${link.slug}`}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-full pr-3.5 leading-[1.2] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-white/30",
        nested ? "py-2 pl-11 text-sm" : cn("pl-3.5", className),
        active ? "bg-white/8 font-semibold text-white" : "text-sidebar-text hover:bg-white/5 hover:text-white",
      )}
    >
      {link.icon ? <Icon name={link.icon} className="size-[18px]" /> : null}
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      {active ? <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", dotClass)} /> : null}
    </Link>
  );
}

/** Buyer "Messages": a parent row with a chevron that shows or hides its sub-pages. */
function CollapsibleGroup({
  group,
  side,
  itemClass,
  isActive,
  onNavigate,
}: {
  group: NavGroup;
  side: PortalSide;
  itemClass: string;
  isActive: (slug: string) => boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const listId = `nav-${group.label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-3 rounded-full px-3.5 text-left leading-[1.2] text-sidebar-text outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-3 focus-visible:ring-white/30",
          itemClass,
        )}
      >
        {group.icon ? <Icon name={group.icon} className="size-[18px]" /> : null}
        <span className="flex-1">{group.label}</span>
        <Icon name="chevron-down" className={cn("size-4 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      <div id={listId} hidden={!open} className="flex flex-col gap-1">
        {group.items.map((link) => (
          <NavItem
            key={link.slug}
            link={link}
            side={side}
            className={itemClass}
            active={isActive(link.slug)}
            dotClass="bg-white"
            nested
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
