"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { SOON_PAGES } from "@/components/shell";

/** Menu items from the Figma sidebar that are not built yet. */
export default function ComingSoonPage() {
  const { slug } = useParams<{ slug: string }>();
  const title = SOON_PAGES[slug];
  if (!title) notFound();
  return (
    <>
      <h1 className="text-[28px] leading-[normal] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">{title}</h1>
      <section className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[24px] bg-panel px-6 py-16 text-center">
        <p className="text-[17px] font-medium text-text-strong">Coming soon</p>
        <p className="max-w-sm text-[15px] text-text-muted">This part of the admin console is being built.</p>
        <Link href="/sellers" className="mt-4 rounded-full bg-sidebar-bg px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Back to sellers
        </Link>
      </section>
    </>
  );
}
