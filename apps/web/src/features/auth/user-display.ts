/** "Khalid Al Amri" → "KA"; "Najd" → "NA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "M";
}

/**
 * Short name for tight spaces such as the landing page profile button:
 * "Khalid Al Amri" → "Khalid". A short first word ("Al Noor Spare Parts")
 * keeps the next word too → "Al Noor".
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0] ?? "";
  return first.length <= 2 && parts[1] ? `${first} ${parts[1]}` : first;
}
