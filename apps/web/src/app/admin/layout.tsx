import type { Metadata } from "next";

/**
 * Admin console (/admin). A separate side of the web app: its own login,
 * session and cookie (`muhrak_rt_admin`), never shared with buyer or seller.
 * There is no admin sign-up; admins are created from the command line.
 * Never indexed (also sent as an X-Robots-Tag header, see next.config.ts).
 */
export const metadata: Metadata = {
  title: "Muhrak Admin Console",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div data-side="admin" className="flex min-h-dvh flex-1 flex-col bg-surface font-portal text-text-strong">
      {children}
    </div>
  );
}
