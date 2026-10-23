import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateTempPassword } from "./passwords";

describe("passwords", () => {
  it("hashes a password and verifies the correct plaintext", async () => {
    const hash = await hashPassword("1234");
    expect(hash).not.toContain("1234");
    expect(await verifyPassword(hash, "1234")).toBe(true);
  });

  it("rejects an incorrect plaintext", async () => {
    const hash = await hashPassword("1234");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("returns a 12-character base64url string", () => {
    const password = generateTempPassword();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("returns a different value on each call", () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
