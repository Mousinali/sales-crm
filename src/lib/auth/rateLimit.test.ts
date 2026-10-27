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

  it("still admits a brand new key when the store is full of non-blocked churn, instead of locking out every new user", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // Fill the store with one-attempt (not yet blocked) entries — none of
    // these are mid-lockout, so there's room to evict some for new keys.
    for (let i = 0; i < 10_000; i++) checkRateLimit(`churn-key-${i}`, 5, 10 * 60_000);
    expect(_rateLimitStoreSize()).toBe(10_000);

    // A brand new identifier must still get through — failing closed for
    // everyone just because the store is full of harmless one-off entries
    // would itself lock every user out of login.
    expect(checkRateLimit("new-user", 5, 10 * 60_000)).toBe(true);
  });

  it("never un-blocks an already-rate-limited key by evicting it to make room for new ones", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // Trip the limit for one real identifier first.
    for (let i = 0; i < 5; i++) checkRateLimit("victim", 5, 10 * 60_000);
    expect(checkRateLimit("victim", 5, 10 * 60_000)).toBe(false);

    // Flood the store with enough unique keys to hit the cap.
    for (let i = 0; i < 10_010; i++) checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000);

    // The victim's own lockout must still hold — eviction must never
    // remove a still-active, still-blocked entry to make room for churn.
    expect(checkRateLimit("victim", 5, 10 * 60_000)).toBe(false);
  });

  it("never evicts a partially-used counter (2+ attempts) to make room, only truly-fresh single-attempt entries", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // This identifier has already made 2 of its 5 allowed attempts —
    // evicting it would let a flood of junk keys reset a target's
    // in-progress attempt count back to zero before it ever locks out.
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);

    for (let i = 0; i < 10_010; i++) checkRateLimit(`flood-key-${i}`, 5, 10 * 60_000);

    // 3 more calls brings it to 5 total — if it survived as count=2, this
    // trips the limit; if it got evicted and restarted fresh, it wouldn't.
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);
    checkRateLimit("in-progress", 5, 10 * 60_000);
    expect(checkRateLimit("in-progress", 5, 10 * 60_000)).toBe(false);
  });
});
