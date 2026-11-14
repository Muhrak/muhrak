/**
 * Money rules for Muhrak.
 *
 * Amounts are ALWAYS whole numbers in the currency's smallest unit, stored
 * together with the currency. Never use floats for money.
 *
 * OMR, KWD and BHD have 3 decimal places (1 OMR = 1000 baisa).
 * SAR, AED and QAR have 2.
 */
export const CURRENCY_DECIMALS = {
  OMR: 3,
  KWD: 3,
  BHD: 3,
  SAR: 2,
  AED: 2,
  QAR: 2,
} as const;

export type Currency = keyof typeof CURRENCY_DECIMALS;

export const CURRENCIES = Object.keys(CURRENCY_DECIMALS) as [Currency, ...Currency[]];

export interface Money {
  /** Whole number of minor units, e.g. 100500 for 100.500 OMR. */
  amountMinor: number;
  currency: Currency;
}

/**
 * Convert a decimal string such as "100.500" to minor units, without floats.
 * Throws if the string is not a plain non-negative decimal or has more
 * decimal places than the currency allows.
 */
export function toMinor(amount: string, currency: Currency): number {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) {
    throw new Error(`Invalid amount: "${amount}"`);
  }
  const decimals = CURRENCY_DECIMALS[currency];
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`${currency} allows at most ${decimals} decimal places, got "${amount}"`);
  }
  const minor = Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, "0") || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Amount too large: "${amount}"`);
  }
  return minor;
}

/** Format minor units for display, e.g. { 100500, "OMR" } -> "100.500 OMR". */
export function formatMoney(money: Money): string {
  const decimals = CURRENCY_DECIMALS[money.currency];
  if (!Number.isSafeInteger(money.amountMinor)) {
    throw new Error("amountMinor must be a whole number");
  }
  const sign = money.amountMinor < 0 ? "-" : "";
  const abs = Math.abs(money.amountMinor);
  const base = 10 ** decimals;
  const whole = Math.floor(abs / base).toLocaleString("en-US");
  const fraction = String(abs % base).padStart(decimals, "0");
  return `${sign}${whole}.${fraction} ${money.currency}`;
}

/** Add two amounts. Throws on a currency mismatch instead of silently mixing. */
export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot add ${a.currency} and ${b.currency}`);
  }
  return { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency };
}

/**
 * Take a percentage in basis points (500 = 5.00%), rounded half up to the
 * nearest minor unit. Used for commission.
 */
export function percentOf(money: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new Error("basisPoints must be a non-negative whole number");
  }
  const amountMinor = Math.floor((money.amountMinor * basisPoints + 5000) / 10000);
  return { amountMinor, currency: money.currency };
}
