import Link from "next/link";
import { HOME_PATH, type PortalSide } from "@/features/auth/paths";
import { Icon } from "./icon";

/** Placeholder for sidebar pages that are not built yet, so menu links never 404. */
export function ComingSoon({ side, title }: { side: PortalSide; title: string }) {
  return (
    <>
      <h1 className="text-[28px] leading-[normal] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">{title}</h1>
      <section className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[24px] bg-panel px-6 py-16 text-center">
        <span className="mb-1 flex size-[52px] items-center justify-center rounded-full bg-surface text-text-body">
          <Icon name="clock" className="size-[22px]" />
        </span>
        <p className="text-[17px] leading-[normal] font-medium text-text-strong">Coming soon</p>
        <p className="max-w-sm text-[15px] leading-normal text-text-muted">This part of Muhrak is being built and will be ready shortly.</p>
        <Link
          href={HOME_PATH[side]}
          className="mt-4 flex h-10 items-center rounded-full bg-sidebar-bg px-5 text-sm font-semibold text-white outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-brand-blue/40"
        >
          Back to dashboard
        </Link>
      </section>
    </>
  );
}
