import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SOON_PAGES } from "@/features/admin/nav";

export const instant = false;

/** Menu items from the Figma sidebar that are not built yet. Unknown slugs are a real 404. */
export function generateStaticParams() {
  return Object.keys(SOON_PAGES).map((slug) => ({ slug }));
}

export default function ComingSoonPage({ params }: PageProps<"/admin/soon/[slug]">) {
  return (
    <Suspense fallback={null}>
      <Soon params={params} />
    </Suspense>
  );
}

async function Soon({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const title = SOON_PAGES[slug];
  if (!title) notFound();
  return (
    <>
      <h1 className="text-[28px] leading-[normal] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]">{title}</h1>
      <section className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[24px] bg-panel px-6 py-16 text-center">
        <p className="text-[17px] font-medium text-text-strong">Coming soon</p>
        <p className="max-w-sm text-[15px] text-text-muted">This part of the admin console is being built.</p>
        <Link href="/admin/sellers" className="mt-4 rounded-full bg-sidebar-bg px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
          Back to sellers
        </Link>
      </section>
    </>
  );
}
