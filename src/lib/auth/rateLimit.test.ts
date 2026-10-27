import { describe, it, expect, vi, afterEach } from "vitest";
import { checkRateLimit, _rateLimitStoreSize } from "./rateLimit";

describe("checkRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reclaims space from expired entries once the store is at capacity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 10_000; i++) {
      checkRateLimit(`key-${i}`, 5, 1000);
    }
    expect(_rateLimitStoreSize()).toBe(10_000);

    vi.setSystemTime(10_000); // well past the 1000ms window for every entry above
    // A brand new key still gets a fresh window after pruning reclaims
    // room, instead of being evicted-on-arrival or wrongly rate-limited.
    expect(checkRateLimit("fresh-key", 5, 1000)).toBe(true);
    expect(_rateLimitStoreSize()).toBeLessThan(10_000);
  });

  it("enforces a hard cap even when every entry is still within its window (nothing to prune)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // A long window means pruning finds nothing stale to remove — a flood
    // of unique keys within one window must still be capped, not just
    // left to grow until something happens to expire.
    for (let i = 0; i < 10_010; i++) {
      checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000);
    }
    expect(_rateLimitStoreSize()).toBeLessThanOrEqual(10_000);
  });
});
