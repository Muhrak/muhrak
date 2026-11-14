"use client";

import { useQuery } from "@tanstack/react-query";
import { adminSellerStatsSchema } from "@/schemas";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/layout/icon";
import { useSignOut } from "@/features/auth/hooks";
import { useSession } from "@/features/auth/session";
import { cn } from "@/lib/utils";
import { adminRequest } from "./api";
import { navGroups } from "./nav";

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-white/40";

function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "A";
}

export function useSellerStats() {
  return useQuery({
    queryKey: ["admin", "sellers", "stats"],
    queryFn: () => adminRequest("/v1/admin/sellers/stats", adminSellerStatsSchema),
    refetchInterval: 60_000,
  });
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const signOut = useSignOut("admin");
  const session = useSession("admin");
  const stats = useSellerStats();
  const name = session?.user.fullName ?? "";

  return (
    <nav aria-label="Admin menu" className="flex h-full flex-col gap-0.5 overflow-y-auto bg-sidebar-bg px-[18px] pt-6 pb-5">
      <div className="flex flex-col gap-2 px-2.5 pb-[18px]">
        <Link href="/admin/sellers" onClick={onNavigate} className={cn("w-fit rounded-sm", focusRing)} aria-label="Muhrak admin home">
          <Image src="/portal/muhrak-logo-white.svg" alt="Muhrak" width={156} height={30} priority />
        </Link>
        <p className="bg-admin-gradient bg-clip-text text-sm leading-[normal] font-extrabold text-transparent italic">Admin Console</p>
      </div>
      {navGroups(stats.data?.pending).map((group, index) => (
        <div key={group.label ?? index} className="flex flex-col">
          {group.label ? (
            <p className="pt-3.5 pb-1.5 pl-3.5 text-[11px] leading-[normal] font-medium tracking-[0.08em] text-sidebar-group uppercase">{group.label}</p>
          ) : null}
          {group.items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-full px-3.5 py-[9px] text-sm leading-[normal]",
                  active ? "bg-white/8 font-semibold text-white" : "text-sidebar-text hover:bg-white/5",
                  focusRing,
                )}
              >
                <Icon name={item.icon} className="size-[18px]" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.count ? (
                  <span className="rounded-full bg-admin-orange px-[7px] py-0.5 text-[11px] font-bold text-white">{item.count}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="min-h-6 flex-1" />
      <div className="flex items-center gap-3 rounded-[20px] border border-white/9 bg-gradient-to-b from-white/5 to-white/2 p-3.5">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-admin-gradient text-sm font-semibold text-white">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="text-[13px] text-sidebar-meta">Admin</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className={cn("flex items-center gap-3 rounded-full px-3.5 py-[9px] text-sm leading-[normal] text-sidebar-danger hover:bg-white/5", focusRing)}
      >
        <Icon name="log-out" className="size-[18px]" />
        Log out
      </button>
    </nav>
  );
}

/** Admin frame: 280 px dark sidebar, page on the light surface; a drawer below `lg`. */
export function ConsoleShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="flex min-h-dvh flex-1">
      <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 border-r border-white/6 lg:block">
        <Sidebar />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white text-text-strong"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between bg-sidebar-bg px-4 lg:hidden">
          <Image src="/portal/muhrak-logo-white.svg" alt="Muhrak" width={120} height={23} />
          <button
            type="button"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
            className={cn("flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10", focusRing)}
          >
            <Menu aria-hidden className="size-5" />
          </button>
        </header>
        <main className="flex flex-1 flex-col gap-5 px-4 pt-6 pb-7 sm:px-6 lg:px-10 lg:pt-[30px]">{children}</main>
      </div>
    </div>
  );
}
