import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

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
