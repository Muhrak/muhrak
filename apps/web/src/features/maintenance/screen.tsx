import Image from "next/image";
import { Icon } from "@/components/layout/icon";
import { cn } from "@/lib/utils";
import { formatGulfTime, formatGulfDayTime } from "./time";

/**
 * "We will be right back": what buyers and sellers see while maintenance
 * covers their side. Figma "Maintenance page" card (414:5711) inside the
 * admin "Maintenance Mode" frame, on the light palette; the accent follows
 * the side (buyer blue, seller orange). The message is the admin's plain
 * text, rendered as text (React escapes it).
 */
export type ScreenTone = "buyer" | "seller";

const TONE: Record<ScreenTone, { circle: string; icon: string }> = {
  buyer: { circle: "bg-sky-blue/12", icon: "text-sky-blue" },
  seller: { circle: "bg-seller-orange/12", icon: "text-seller-orange" },
};

/** "Back by 03:30 Gulf time." or, on another day, "Back by Mon 24 Nov, 01:00 Gulf time." */
export function backBy(endsAt: string | null, now = new Date()): string | null {
  if (!endsAt) return null;
  const end = new Date(endsAt);
  const sameDay = end.getTime() - now.getTime() < 20 * 3_600_000;
  return `Back by ${sameDay ? formatGulfTime(endsAt) : formatGulfDayTime(endsAt)} Gulf time.`;
}

/** The small card (admin preview and the centre of the full page). */
export function MaintenanceCard({ message, endsAt, tone, className }: { message: string; endsAt: string | null; tone: ScreenTone; className?: string }) {
  const back = backBy(endsAt);
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center leading-[normal]", className)}>
      <span aria-hidden className={cn("flex size-12 items-center justify-center rounded-full", TONE[tone].circle)}>
        <Icon name="wrench" className={cn("size-[22px]", TONE[tone].icon)} />
      </span>
      <p className="text-lg font-medium text-text-strong">We will be right back</p>
      <p className="max-w-[300px] text-[13px] leading-[1.35] break-words whitespace-pre-line text-text-muted">
        {message}
        {back ? <span className="block">{back}</span> : null}
      </p>
    </div>
  );
}

/** The whole page shown instead of the site. */
export function MaintenanceScreen({ message, endsAt, tone }: { message: string; endsAt: string | null; tone: ScreenTone }) {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-10 bg-surface px-4 py-16 font-portal">
      <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
      <section
        role="status"
        aria-live="polite"
        className="flex w-full max-w-[460px] flex-col items-center rounded-[24px] border border-line bg-panel px-6 py-10 sm:px-10"
      >
        <MaintenanceCard message={message} endsAt={endsAt} tone={tone} />
      </section>
      <p className="max-w-[460px] text-center text-[13px] leading-[1.4] text-text-subtle">
        Your account and your data are safe. This page checks again every minute and the site comes back on its own.
      </p>
    </main>
  );
}
