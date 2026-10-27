import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, _rateLimitStoreSize } from "./rateLimit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prunes expired entries instead of growing the store forever", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 10_001; i++) {
      checkRateLimit(`key-${i}`, 5, 1000);
    }
    expect(_rateLimitStoreSize()).toBeGreaterThan(10_000);

    vi.setSystemTime(10_000); // well past the 1000ms window for every entry above
    checkRateLimit("trigger-prune", 5, 1000);
    expect(_rateLimitStoreSize()).toBeLessThan(10_001);
  });
});
