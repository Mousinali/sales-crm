import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("redirects DATABASE_URL to the isolated _test database instead of dev's", () => {
    const url = new URL(process.env.DATABASE_URL!);
    expect(url.pathname.endsWith("_test")).toBe(true);
  });
});
