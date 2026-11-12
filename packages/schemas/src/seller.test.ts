import { describe, expect, it } from "vitest";
import { sellerProfileInputSchema } from "./seller";

const base = {
  companyName: "Najd Equipment",
  country: "OM",
  city: "Muscat",
  phone: "+968 9123 4567",
  vatRegistered: false,
};

describe("sellerProfileInputSchema", () => {
  it("normalises phone and website", () => {
    const parsed = sellerProfileInputSchema.parse({ ...base, website: "najd.om" });
    expect(parsed.phone).toBe("+96891234567");
    expect(parsed.website).toBe("https://najd.om");
  });

  it("treats an empty website as none", () => {
    expect(sellerProfileInputSchema.parse({ ...base, website: "" }).website).toBeNull();
    expect(sellerProfileInputSchema.parse(base).website).toBeNull();
  });

  it("refuses script links and non-web schemes", () => {
    for (const website of ["javascript:alert(1)", "data:text/html,hi", "ftp://x.om", "https://localhost"]) {
      expect(sellerProfileInputSchema.safeParse({ ...base, website }).success, website).toBe(false);
    }
  });

  it("refuses non-GCC countries, bad phones and control characters", () => {
    expect(sellerProfileInputSchema.safeParse({ ...base, country: "US" }).success).toBe(false);
    expect(sellerProfileInputSchema.safeParse({ ...base, phone: "91234567" }).success).toBe(false);
    expect(sellerProfileInputSchema.safeParse({ ...base, companyName: "Najd\u0000Equipment" }).success).toBe(false);
    expect(sellerProfileInputSchema.safeParse({ ...base, about: "line one\nline two" }).success).toBe(true);
    expect(sellerProfileInputSchema.safeParse({ ...base, about: "bell\u0007" }).success).toBe(false);
  });

  it("limits brands", () => {
    const brands = Array.from({ length: 21 }, (_, i) => `Brand ${i}`);
    expect(sellerProfileInputSchema.safeParse({ ...base, brands }).success).toBe(false);
  });
});
