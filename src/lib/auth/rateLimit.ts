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
//
// Tracked per namespace (the part of the key before its first ":", e.g.
// "email" for login, "change-password" for change-password), not as one
// global counter — otherwise a flood of brand-new login identifiers would
// also block brand-new change-password admissions, an unrelated feature
// sharing nothing but this module.
const NEW_KEY_WINDOW_MS = 60_000;
const MAX_NEW_KEYS_PER_WINDOW = 500;
const newKeyWindows = new Map<string, { windowStart: number; count: number }>();

function namespaceOf(key: string): string {
  return key.split(":", 1)[0];
}

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, entry] of attempts) {
    if (now - entry.windowStart > windowMs) attempts.delete(key);
  }
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    const namespace = namespaceOf(key);
    const admission = newKeyWindows.get(namespace);
    if (!admission || now - admission.windowStart > NEW_KEY_WINDOW_MS) {
      newKeyWindows.set(namespace, { windowStart: now, count: 0 });
    }
    const current = newKeyWindows.get(namespace)!;
    if (current.count >= MAX_NEW_KEYS_PER_WINDOW) {
      // A flood of brand-new identifiers within this namespace — fail
      // closed for new keys in that namespace only. Every identifier
      // already being tracked, in any namespace, keeps working normally;
      // nothing already in the store is evicted or reset.
      return false;
    }
    if (attempts.size >= MAX_ENTRIES) {
      pruneExpired(now, windowMs);
      if (attempts.size >= MAX_ENTRIES) return false;
    }
    current.count += 1;
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

// Seconds left until this key's window resets and it's admitted again — 0
// if it isn't currently rate-limited. Lets a caller tell the user exactly
// how long to wait instead of a vague "try again later".
export function getRetryAfterSeconds(key: string, windowMs: number): number {
  const entry = attempts.get(key);
  if (!entry) return 0;
  const remainingMs = entry.windowStart + windowMs - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function _rateLimitStoreSize(): number {
  return attempts.size;
}

export function _resetRateLimitForTesting(): void {
  attempts.clear();
  newKeyWindows.clear();
}
