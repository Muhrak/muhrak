import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AuthShellProps {
  /** Large heading on the left panel. */
  panelTitle: string;
  panelDescription: string;
  /** Optional onboarding steps under the panel text. The first step is the current one. */
  steps?: readonly string[];
  /** Form heading (the page's h1). */
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * Two-column auth layout from Figma "Buyer – Sign up / Log in (Light)":
 * a white panel with the aurora on the left, the form centred on the right.
 * Below `lg` the panel is hidden and the form takes the full width.
 */
export function AuthShell({ panelTitle, panelDescription, steps, title, description, children }: AuthShellProps) {
  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[640fr_784fr] lg:py-4 lg:pl-4">
      <aside className="relative hidden overflow-hidden rounded-[24px] border border-black/6 bg-white lg:sticky lg:top-4 lg:grid lg:h-[calc(100dvh-2rem)] lg:grid-rows-[minmax(96px,429px)_auto_1fr]">
        <Image
          src="/auth/aurora.svg"
          alt=""
          width={1580}
          height={1180}
          priority
          className="pointer-events-none absolute top-[-661px] left-1/2 h-[1180px] w-[1580px] max-w-none -translate-x-1/2"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[868px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.05)_12%,rgba(255,255,255,0.6)_35%,#fff_55%,#fff_100%)]"
        />

        <div className="relative row-start-2 flex flex-col items-center px-6 text-center">
          <MuhrakLogo />
          <p className="mt-7 text-[40px] leading-[normal] tracking-[-0.02em] text-ink">{panelTitle}</p>
          <p className="mt-3.5 w-[330px] text-base leading-normal text-ink-secondary">{panelDescription}</p>
          {steps ? (
            <ol className="mt-9 flex w-[320px] flex-col gap-2.5 text-left">
              {steps.map((step, index) => {
                const current = index === 0;
                return (
                  <li
                    key={step}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[12px] px-4 py-3.5 text-sm leading-[normal]",
                      current ? "bg-ink font-medium text-white" : "bg-black/4 text-ink-secondary",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-ink",
                        current ? "bg-white" : "bg-black/8",
                      )}
                    >
                      {index + 1}
                    </span>
                    {step}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-[420px] flex-col items-center">
          <div className="mb-8 lg:hidden">
            <MuhrakLogo />
          </div>
          <h1 className="text-center text-[32px] leading-[normal] tracking-[-0.02em] text-ink">{title}</h1>
          <p className="mt-2.5 text-center text-sm leading-[normal] text-ink-tertiary">{description}</p>
          <div className="mt-7 w-full">{children}</div>
        </div>
      </main>
    </div>
  );
}

function MuhrakLogo() {
  return (
    <Link href="/" aria-label="Muhrak home" className="flex rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
    </Link>
  );
}

/** "Or" divider between the social buttons and the email form. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3.5" role="separator">
      <span className="h-px flex-1 bg-black/10" />
      <span className="text-xs leading-[normal] text-ink-tertiary">Or</span>
      <span className="h-px flex-1 bg-black/10" />
    </div>
  );
}

/** Google / Apple buttons. Social sign-in is not built yet, so a click reports that instead. */
export function SocialButtons({ onUnavailable }: { onUnavailable: (provider: string) => void }) {
  return (
    <div className="flex gap-3">
      {(
        [
          { name: "Google", icon: "/auth/google.svg" },
          { name: "Apple", icon: "/auth/apple.svg" },
        ] as const
      ).map((provider) => (
        <button
          key={provider.name}
          type="button"
          onClick={() => onUnavailable(provider.name)}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-black/22 text-sm leading-[normal] font-medium text-ink transition-colors outline-none hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Image src={provider.icon} alt="" width={16} height={16} />
          {provider.name}
        </button>
      ))}
    </div>
  );
}

/** Pill-shaped primary submit button. */
export const primaryButtonClass =
  "flex h-[50px] w-full items-center justify-center rounded-full bg-ink text-[15px] leading-[normal] font-medium text-white transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60";





