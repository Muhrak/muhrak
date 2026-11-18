import { describe, expect, it } from "vitest";
import { partSearchQuerySchema } from "./search";

describe("partSearchQuerySchema", () => {
  it("accepts the search box alone, as before", () => {
    expect(partSearchQuerySchema.parse({ q: " 6020/F4 " })).toEqual({ q: "6020/F4", page: 1 });
  });

  it("accepts photo-search fields without q, and treats blanks as not given", () => {
    expect(partSearchQuerySchema.parse({ q: "", partNumber: "15-FB-02", machine: "  " })).toEqual({ partNumber: "15-FB-02", page: 1 });
  });

  it("refuses a search with nothing to search for", () => {
    expect(partSearchQuerySchema.safeParse({}).success).toBe(false);
    expect(partSearchQuerySchema.safeParse({ q: "a", machine: " " }).success).toBe(false);
  });

  it("limits lengths and pages", () => {
    expect(partSearchQuerySchema.safeParse({ partNumber: "x".repeat(41) }).success).toBe(false);
    expect(partSearchQuerySchema.safeParse({ machine: "x".repeat(81) }).success).toBe(false);
    expect(partSearchQuerySchema.safeParse({ q: "bushing", page: "51" }).success).toBe(false);
    expect(partSearchQuerySchema.safeParse({ q: "bushing", category: "not-a-uuid" }).success).toBe(false);
  });
});
