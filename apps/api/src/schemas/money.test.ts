import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, percentOf, toMinor } from "./money";

describe("toMinor", () => {
  it("handles 3-decimal currencies", () => {
    expect(toMinor("100.500", "OMR")).toBe(100500);
    expect(toMinor("46", "OMR")).toBe(46000);
    expect(toMinor("0.1", "KWD")).toBe(100);
  });

  it("handles 2-decimal currencies", () => {
    expect(toMinor("19.99", "AED")).toBe(1999);
  });

  it("rejects too many decimals and junk", () => {
    expect(() => toMinor("1.999", "AED")).toThrow();
    expect(() => toMinor("-5", "OMR")).toThrow();
    expect(() => toMinor("abc", "OMR")).toThrow();
  });
});

describe("formatMoney", () => {
  it("formats with the right number of decimals", () => {
    expect(formatMoney({ amountMinor: 100500, currency: "OMR" })).toBe("100.500 OMR");
    expect(formatMoney({ amountMinor: 1240000, currency: "OMR" })).toBe("1,240.000 OMR");
    expect(formatMoney({ amountMinor: 1999, currency: "AED" })).toBe("19.99 AED");
    expect(formatMoney({ amountMinor: -24000, currency: "OMR" })).toBe("-24.000 OMR");
  });
});

describe("addMoney", () => {
  it("adds same-currency amounts", () => {
    const total = addMoney({ amountMinor: 92000, currency: "OMR" }, { amountMinor: 8500, currency: "OMR" });
    expect(total).toEqual({ amountMinor: 100500, currency: "OMR" });
  });

  it("refuses to mix currencies", () => {
    expect(() =>
      addMoney({ amountMinor: 1, currency: "OMR" }, { amountMinor: 1, currency: "AED" }),
    ).toThrow();
  });
});

describe("percentOf", () => {
  it("calculates commission in basis points", () => {
    // 3.5% of 154.000 OMR = 5.390 OMR
    expect(percentOf({ amountMinor: 154000, currency: "OMR" }, 350).amountMinor).toBe(5390);
    // 5% of 76.000 OMR = 3.800 OMR
    expect(percentOf({ amountMinor: 76000, currency: "OMR" }, 500).amountMinor).toBe(3800);
  });
});
