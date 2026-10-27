// In-memory fixed-window attempt counter for login and other sensitive
// operations (req.md §13 "Rate-limit login and sensitive operations").
// shortcut: per-process memory only — a multi-instance deployment needs a
// shared store (e.g. Redis) instead, since each instance would otherwise
// count attempts independently. Upgrade if the production deployment runs
// more than one app instance behind a load balancer.
const attempts = new Map<string, { count: number; limit: number; windowStart: number }>();
const MAX_ENTRIES = 10_000;

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart > windowMs) attempts.delete(key);
  }
}

// Evicting the oldest entries outright could remove one that is currently
// mid-lockout (count >= its own limit), un-blocking an attacker who floods
// the store with junk keys — worse than the growth problem this guards
// against. Evicting only entries with exactly one attempt recorded avoids
// that while still making room for new users (so a full store doesn't
// lock everyone out of login), without resetting any identifier that
// already has 2+ attempts in progress — a flood of fresh junk keys must
// not be able to reset a target's partially-used counter back to zero
// before it ever locks out. Only if every entry has 2+ attempts does a new
// key fail closed — an extreme scenario where that's an acceptable,
// temporary cost.
function evictFreshEntries(count: number): void {
  let remaining = count;
  for (const [key, entry] of attempts) {
    if (remaining <= 0) break;
    if (entry.count === 1) {
      attempts.delete(key);
      remaining -= 1;
    }
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    if (attempts.size >= MAX_ENTRIES) {
      pruneExpired(now, windowMs);
      if (attempts.size >= MAX_ENTRIES) evictFreshEntries(attempts.size - MAX_ENTRIES + 1);
      if (attempts.size >= MAX_ENTRIES) return false;
    }
    attempts.set(key, { count: 1, limit, windowStart: now });
    return true;
  }
  if (entry.count >= entry.limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

export function _rateLimitStoreSize(): number {
  return attempts.size;
}
