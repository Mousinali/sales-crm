import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("loads env vars from .env.local", () => {
    expect(process.env.DATABASE_URL).toBe("postgresql://skmousin@localhost:5432/sales_crm");
  });
});
