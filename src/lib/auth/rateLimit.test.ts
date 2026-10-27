import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, _rateLimitStoreSize, _resetRateLimitForTesting } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTesting();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reclaims space from expired entries once the store is at capacity", () => {
    // Build up to capacity across many admission windows (500 brand-new
    // keys per 60s window), not all at once, so this test exercises
    // pruning specifically rather than tripping the admission throttle.
    let created = 0;
    let windowStart = 0;
    while (created < 10_000) {
      vi.setSystemTime(windowStart);
      for (let i = 0; i < 500 && created < 10_000; i++, created++) {
        checkRateLimit(`key-${created}`, 5, 100 * 60_000);
      }
      windowStart += 61_000;
    }
    expect(_rateLimitStoreSize()).toBe(10_000);

    vi.setSystemTime(windowStart + 100 * 60_000 + 1_000); // well past every entry's own window
    expect(checkRateLimit("fresh-key", 5, 100 * 60_000)).toBe(true);
    expect(_rateLimitStoreSize()).toBeLessThan(10_000);
  });

  it("throttles a flood of brand-new identifiers without touching any existing entry", () => {
    // Trip the limit for one real identifier first.
    for (let i = 0; i < 5; i++) checkRateLimit("victim", 5, 10 * 60_000);
    expect(checkRateLimit("victim", 5, 10 * 60_000)).toBe(false);

    // A flood of distinct new keys, all within the same admission window.
    let sawThrottled = false;
    for (let i = 0; i < 600; i++) {
      if (!checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000)) sawThrottled = true;
    }
    expect(sawThrottled).toBe(true);

    // The victim's own lockout must still hold — admission throttling
    // never evicts or resets an existing entry to make room.
    expect(checkRateLimit("victim", 5, 10 * 60_000)).toBe(false);
  });

  it("never resets a partially-used counter (2+ attempts), even under a flood of new keys", () => {
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);

    for (let i = 0; i < 600; i++) checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000);

    // 3 more calls brings it to 5 total — if it survived as count=2, this
    // trips the limit; if it had been reset, it wouldn't.
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);
    expect(checkRateLimit("in-progress", 5, 10 * 60_000)).toBe(false);
  });

  it("admits new identifiers again once the admission window rolls over", () => {
    for (let i = 0; i < 500; i++) checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000);
    expect(checkRateLimit("blocked-by-flood", 5, 10 * 60_000)).toBe(false);

    vi.setSystemTime(70_000); // past the 60s admission window
    expect(checkRateLimit("admitted-after-rollover", 5, 10 * 60_000)).toBe(true);
  });
});
