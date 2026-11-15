/**
 * Maintenance times are shown and entered in Gulf time (Oman, UTC+4, no
 * daylight saving), whatever the viewer's own time zone is.
 */
export const GULF_TIME_ZONE = "Asia/Muscat";
const GULF_OFFSET = "+04:00";

const dayTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: GULF_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const timeOnly = new Intl.DateTimeFormat("en-GB", { timeZone: GULF_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayOnly = new Intl.DateTimeFormat("en-GB", { timeZone: GULF_TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: GULF_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** "Sun 23 Nov, 02:00" */
export function formatGulfDayTime(iso: string): string {
  return dayTime.format(new Date(iso)).replace(/^(\w+) (\d+ \w+),? /, "$1 $2, ");
}

/** "02:00" */
export function formatGulfTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

/** "2 Nov 2026" */
export function formatGulfDate(iso: string): string {
  return dayOnly.format(new Date(iso));
}

function sameGulfDay(a: string, b: string): boolean {
  return dayKey.format(new Date(a)) === dayKey.format(new Date(b));
}

/** "Sun 23 Nov, 02:00–03:30" or, across midnight, "Sun 23 Nov, 22:00 – Mon 24 Nov, 01:00". */
export function formatGulfRange(startIso: string, endIso: string | null): string {
  if (!endIso) return `from ${formatGulfDayTime(startIso)}`;
  return sameGulfDay(startIso, endIso)
    ? `${formatGulfDayTime(startIso)}–${formatGulfTime(endIso)}`
    : `${formatGulfDayTime(startIso)} – ${formatGulfDayTime(endIso)}`;
}

/** "40 min", "1 h 10 min" */
export function formatDuration(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** A `<input type="datetime-local">` value ("2026-11-23T02:00"), read as Gulf time, as an ISO string. Null if empty or invalid. */
export function gulfInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${GULF_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** An ISO time as a datetime-local value in Gulf time. */
export function isoToGulfInput(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 4 * 3_600_000);
  return shifted.toISOString().slice(0, 16);
}
