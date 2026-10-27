// In-memory fixed-window attempt counter for login and other sensitive
// operations (req.md §13 "Rate-limit login and sensitive operations").
// shortcut: per-process memory only — a multi-instance deployment needs a
// shared store (e.g. Redis) instead, since each instance would otherwise
// count attempts independently. Upgrade if the production deployment runs
// more than one app instance behind a load balancer.
const attempts = new Map<string, { count: number; windowStart: number }>();
const MAX_ENTRIES = 10_000;

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart > windowMs) attempts.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    if (attempts.size >= MAX_ENTRIES) {
      pruneExpired(now, windowMs);
      // Still full of live entries after pruning: fail closed for this new
      // key rather than evict an existing one to make room. Evicting here
      // could un-block an entry that is currently mid-lockout, which would
      // defeat the whole point of the limit for that identifier.
      if (attempts.size >= MAX_ENTRIES) return false;
    }
    attempts.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= limit) {
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
