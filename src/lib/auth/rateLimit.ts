// In-memory fixed-window attempt counter for login and other sensitive
// operations (req.md §13 "Rate-limit login and sensitive operations").
// shortcut: per-process memory only — a multi-instance deployment needs a
// shared store (e.g. Redis) instead, since each instance would otherwise
// count attempts independently. Upgrade if the production deployment runs
// more than one app instance behind a load balancer.
const attempts = new Map<string, { count: number; limit: number; windowStart: number }>();
const MAX_ENTRIES = 10_000;

// Bounds the store's size by capping how fast brand-new identifiers are
// admitted, not by evicting existing ones. Any eviction rule keyed on an
// entry's own state (its count, its age) is gameable: an attacker can
// always manufacture enough distinct keys to make that rule evict
// whatever they want — including their own counter — resetting it
// indefinitely and defeating the limit entirely. Throttling admission
// instead means no live entry is ever touched to make room for another.
const NEW_KEY_WINDOW_MS = 60_000;
const MAX_NEW_KEYS_PER_WINDOW = 500;
// Lazily initialized on first use (not Date.now() at import time), so it
// tracks whatever clock is active when a key is first admitted rather than
// the real wall clock at module load — otherwise a faked/mocked clock in
// tests could never look "stale" relative to a real timestamp set earlier.
let newKeyWindowStart: number | null = null;
let newKeysThisWindow = 0;

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart > windowMs) attempts.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    if (newKeyWindowStart === null || now - newKeyWindowStart > NEW_KEY_WINDOW_MS) {
      newKeyWindowStart = now;
      newKeysThisWindow = 0;
    }
    if (newKeysThisWindow >= MAX_NEW_KEYS_PER_WINDOW) {
      // A flood of brand-new identifiers — fail closed for new keys only.
      // Every identifier already being tracked keeps working normally;
      // nothing already in the store is evicted or reset.
      return false;
    }
    if (attempts.size >= MAX_ENTRIES) {
      pruneExpired(now, windowMs);
      if (attempts.size >= MAX_ENTRIES) return false;
    }
    newKeysThisWindow += 1;
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

export function _resetRateLimitForTesting(): void {
  attempts.clear();
  newKeyWindowStart = null;
  newKeysThisWindow = 0;
}
