import { describe, expect, it } from "vitest";
import { containsContactDetails } from "./chat";

describe("containsContactDetails (a warning hint, not a security check)", () => {
  it("spots emails, phone numbers and messenger names", () => {
    for (const text of ["mail me at sami@gulfparts.om", "call +968 9123 4567", "9123-4567 and 9876", "00971501234567", "send it on WhatsApp", "wa.me/96891234567", "my telegram is sami"]) {
      expect(containsContactDetails(text), text).toBe(true);
    }
  });

  it("leaves normal part talk alone", () => {
    for (const text of ["Part no. 6020/F4, 2 pieces", "Price 185.000 OMR, delivery in 5 days", "Kobelco SK380, 24V", "RQ-1016"]) {
      expect(containsContactDetails(text), text).toBe(false);
    }
  });
});
