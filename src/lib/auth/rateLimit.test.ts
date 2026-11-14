import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkRateLimit, getRetryAfterSeconds, _rateLimitStoreSize, _resetRateLimitForTesting } from "./rateLimit";

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
        checkRateLimit(`ns:key-${created}`, 5, 100 * 60_000);
      }
      windowStart += 61_000;
    }
    expect(_rateLimitStoreSize()).toBe(10_000);

    vi.setSystemTime(windowStart + 100 * 60_000 + 1_000); // well past every entry's own window
    expect(checkRateLimit("ns:fresh-key", 5, 100 * 60_000)).toBe(true);
    expect(_rateLimitStoreSize()).toBeLessThan(10_000);
  });

  it("throttles a flood of brand-new identifiers within one namespace without touching any existing entry", () => {
    // Trip the limit for one real identifier first.
    for (let i = 0; i < 5; i++) checkRateLimit("email:victim", 5, 10 * 60_000);
    expect(checkRateLimit("email:victim", 5, 10 * 60_000)).toBe(false);

    // A flood of distinct new keys in the same namespace, same window.
    let sawThrottled = false;
    for (let i = 0; i < 600; i++) {
      if (!checkRateLimit(`email:flood-key-${i}`, 5, 10 * 60_000)) sawThrottled = true;
    }
    expect(sawThrottled).toBe(true);

    // The victim's own lockout must still hold — admission throttling
    // never evicts or resets an existing entry to make room.
    expect(checkRateLimit("email:victim", 5, 10 * 60_000)).toBe(false);
  });

  it("does not let a flood in one namespace block admission in an unrelated namespace", () => {
    for (let i = 0; i < 600; i++) checkRateLimit(`email:flood-key-${i}`, 5, 10 * 60_000);
    expect(checkRateLimit("email:blocked-by-flood", 5, 10 * 60_000)).toBe(false);

    // A completely unrelated feature (change-password) sharing nothing but
    // this module must not be collateral damage from a login-side flood.
    expect(checkRateLimit("change-password:42", 5, 10 * 60_000)).toBe(true);
  });

  it("never resets a partially-used counter (2+ attempts), even under a flood of new keys", () => {
    checkRateLimit("email:in-progress", 5, 10 * 60_000);
    checkRateLimit("email:in-progress", 5, 10 * 60_000);

    for (let i = 0; i < 600; i++) checkRateLimit(`email:flood-key-${i}`, 5, 10 * 60_000);

    // 3 more calls brings it to 5 total — if it survived as count=2, this
    // trips the limit; if it had been reset, it wouldn't.
    checkRateLimit("email:in-progress", 5, 10 * 60_000);
    checkRateLimit("email:in-progress", 5, 10 * 60_000);
    checkRateLimit("email:in-progress", 5, 10 * 60_000);
    expect(checkRateLimit("email:in-progress", 5, 10 * 60_000)).toBe(false);
  });

  it("admits new identifiers again once the admission window rolls over", () => {
    for (let i = 0; i < 500; i++) checkRateLimit(`email:flood-key-${i}`, 5, 10 * 60_000);
    expect(checkRateLimit("email:blocked-by-flood", 5, 10 * 60_000)).toBe(false);

    vi.setSystemTime(70_000); // past the 60s admission window
    expect(checkRateLimit("email:admitted-after-rollover", 5, 10 * 60_000)).toBe(true);
  });
});

describe("getRetryAfterSeconds", () => {
  beforeEach(() => {
    _resetRateLimitForTesting();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is 0 for a key that was never rate-limited", () => {
    expect(getRetryAfterSeconds("email:never-seen", 10 * 60_000)).toBe(0);
  });

  it("counts down the remaining window, reaching 0 once it elapses", () => {
    const windowMs = 10 * 60_000;
    checkRateLimit("email:limited", 5, windowMs);

    expect(getRetryAfterSeconds("email:limited", windowMs)).toBe(600);

    vi.setSystemTime(60_000); // 1 minute into the 10-minute window
    expect(getRetryAfterSeconds("email:limited", windowMs)).toBe(540);

    vi.setSystemTime(windowMs + 1);
    expect(getRetryAfterSeconds("email:limited", windowMs)).toBe(0);
  });

  it("falls back to the admission window's remaining time for a key blocked by the new-key flood throttle, instead of 0", () => {
    // This key was never admitted into `attempts` at all — it was
    // rejected at the door by the flood throttle — so the per-key branch
    // above can't see it. Without the fallback this silently returned 0.
    for (let i = 0; i < 500; i++) checkRateLimit(`email:flood-key-${i}`, 5, 10 * 60_000);
    expect(checkRateLimit("email:brand-new", 5, 10 * 60_000)).toBe(false);

    expect(getRetryAfterSeconds("email:brand-new", 10 * 60_000)).toBe(60);

    vi.setSystemTime(45_000); // 45s into the 60s admission window
    expect(getRetryAfterSeconds("email:brand-new", 10 * 60_000)).toBe(15);
  });
});
