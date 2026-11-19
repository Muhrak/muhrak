/**
 * Filled icons for the Buyer Centre rail, drawn like the reference's
 * (solid shapes; details cut out in the rail colour). 24 x 24.
 */

export type RailIconName = "dashboard" | "messages" | "requests" | "orders" | "payments" | "saved" | "settings" | "logout";

/** The rail background, used to cut details out of the solid shapes. */
const CUT = "#0a0b12";

export function RailIcon({ name, className }: { name: RailIconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      {SHAPES[name]}
    </svg>
  );
}

const SHAPES: Record<RailIconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.6" height="7.6" rx="3.2" />
      <rect x="13.4" y="3" width="7.6" height="7.6" rx="3.2" />
      <rect x="3" y="13.4" width="7.6" height="7.6" rx="3.2" />
      <rect x="13.4" y="13.4" width="7.6" height="7.6" rx="3.2" />
    </>
  ),
  messages: (
    <>
      <path d="M12 2.8c-5.1 0-9.2 3.7-9.2 8.3 0 2.4 1.1 4.6 2.9 6.1l-.8 3.6c-.1.5.4.9.9.6l3.6-2c.8.2 1.7.3 2.6.3 5.1 0 9.2-3.7 9.2-8.6S17.1 2.8 12 2.8Z" />
      <circle cx="8" cy="11.2" r="1.25" fill={CUT} />
      <circle cx="12" cy="11.2" r="1.25" fill={CUT} />
      <circle cx="16" cy="11.2" r="1.25" fill={CUT} />
    </>
  ),
  requests: (
    <>
      <rect x="4.2" y="3.6" width="15.6" height="18" rx="3.6" />
      <rect x="8.4" y="2" width="7.2" height="3.6" rx="1.6" />
      <rect x="8" y="10" width="8" height="1.8" rx=".9" fill={CUT} />
      <rect x="8" y="14.4" width="5.4" height="1.8" rx=".9" fill={CUT} />
    </>
  ),
  orders: (
    <>
      <path d="M11.1 2.3a2 2 0 0 1 1.8 0l7.2 3.7c.7.3 1.1 1 1.1 1.8v8.4c0 .8-.4 1.5-1.1 1.8l-7.2 3.7a2 2 0 0 1-1.8 0l-7.2-3.7A2 2 0 0 1 2.8 16.2V7.8c0-.8.4-1.5 1.1-1.8l7.2-3.7Z" />
      <path d="M3.4 6.9 12 11.4l8.6-4.5M12 11.4v10" stroke={CUT} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </>
  ),
  payments: (
    <>
      <rect x="2.2" y="4.6" width="19.6" height="14.8" rx="3.4" />
      <rect x="2.2" y="8.4" width="19.6" height="2.4" fill={CUT} />
      <rect x="5.4" y="14" width="4.6" height="1.9" rx=".95" fill={CUT} />
    </>
  ),
  saved: (
    <>
      <circle cx="12" cy="12" r="9.6" />
      <path d="M12 7.2V12l3.2 2.1" stroke={CUT} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  settings: (
    <>
      <path d="M10.3 2.2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.8c.1.6.1 1.3 0 1.9l2 1.8-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.8a6 6 0 0 1 0-1.9l-2-1.8 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9l.5-2.6Z" transform="translate(0 1.4)" />
      <circle cx="12" cy="12" r="3" fill={CUT} />
    </>
  ),
  logout: (
    <>
      <path d="M6.2 3.2h6.4a3 3 0 0 1 3 3v3.4H11a2.4 2.4 0 0 0 0 4.8h4.6v3.4a3 3 0 0 1-3 3H6.2a3 3 0 0 1-3-3V6.2a3 3 0 0 1 3-3Z" />
      <path d="M11 12h10m-2.8-2.9L21 12l-2.8 2.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};
