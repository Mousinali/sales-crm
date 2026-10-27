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

// Pruning only removes entries whose window has already elapsed — a flood
// of unique keys arriving faster than any window expires would otherwise
// still grow the store past MAX_ENTRIES forever. Map iteration order is
// insertion order, so evicting the oldest entries first is a real ceiling,
// not just a best-effort cleanup.
function evictOldest(overBy: number): void {
  const it = attempts.keys();
  for (let i = 0; i < overBy; i++) {
    const next = it.next();
    if (next.done) break;
    attempts.delete(next.value);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    // About to insert/replace a key — make room first so the map never
    // exceeds MAX_ENTRIES even right after this insert.
    if (attempts.size >= MAX_ENTRIES) {
      pruneExpired(now, windowMs);
      if (attempts.size >= MAX_ENTRIES) evictOldest(attempts.size - MAX_ENTRIES + 1);
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
