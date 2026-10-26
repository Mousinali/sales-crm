import { describe, it, expect } from "vitest";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";

describe("normalizeCompanyName", () => {
  it("lowercases and strips punctuation/whitespace so near-identical names match", () => {
    expect(normalizeCompanyName("Acme Corp.")).toBe("acmecorp");
    expect(normalizeCompanyName("  ACME   CORP  ")).toBe("acmecorp");
    expect(normalizeCompanyName("Acme, Corp. (Pvt) Ltd.")).toBe("acmecorppvtltd");
  });
});

describe("normalizePhone", () => {
  it("keeps digits only, so formatting differences still match", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizePhone("415.555.0100")).toBe("4155550100");
  });
});

describe("extractDomain", () => {
  it("extracts a lowercase host with protocol and www stripped", () => {
    expect(extractDomain("https://www.Acme.com/pricing")).toBe("acme.com");
    expect(extractDomain("acme.com")).toBe("acme.com");
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("")).toBeNull();
  });
});
