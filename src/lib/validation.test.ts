import { describe, it, expect } from "vitest";
import {
  digitsOnly, isValidPhone, isValidEmail, isValidPincode, isValidGst, isValidAccountNumber,
  isValidWebsite, isValidUrl, phoneSchema, optionalPhoneSchema,
} from "./validation";

describe("validation", () => {
  it("digitsOnly strips letters and symbols and caps length", () => {
    expect(digitsOnly("+91 (98765)-43abc210")).toBe("919876543210");
    expect(digitsOnly("98765432109999", 10)).toBe("9876543210");
  });
  it("phone: 10-15 digits only", () => {
    expect(isValidPhone("9876543210")).toBe(true);
    for (const bad of ["", "123", "98765 43210", "+919876543210", "98765abc10", "9".repeat(16)]) expect(isValidPhone(bad)).toBe(false);
    expect(phoneSchema.safeParse("98765abc10").success).toBe(false);
    expect(optionalPhoneSchema.safeParse("").success).toBe(true);
  });
  it("email, pincode, GST, account number, website, url", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidPincode("560001")).toBe(true);
    expect(isValidPincode("56000")).toBe(false);
    expect(isValidPincode("56000a")).toBe(false);
    expect(isValidGst("22AAAAA0000A1Z5")).toBe(true);
    expect(isValidGst("22AAAAA0000A1X5")).toBe(false);
    expect(isValidAccountNumber("123456789")).toBe(true);
    expect(isValidAccountNumber("12345678")).toBe(false);
    expect(isValidWebsite("acme.com")).toBe(true);
    expect(isValidWebsite("N/A")).toBe(false);
    expect(isValidUrl("https://x.com/y")).toBe(true);
    expect(isValidUrl("x.com")).toBe(false);
  });
});
