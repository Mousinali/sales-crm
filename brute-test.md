# Security & Performance — Full Test Sweep

Date: 2026-11-25 · App: `sales-crm` · Target: live dev server (`localhost:3000`) + Postgres `sales_crm`.
Method: static review + full test suite (583 passing) + live HTTP tests with autocannon/curl + DB verification.

## Verdict

**No vulnerabilities found (no HIGH/MEDIUM). Fast at current scale.** Every control below was exercised live, not just read. Test sessions were minted via the app's own `createSession` and revoked after; no real account passwords were used; no data was mutated (IDOR attempt was blocked, payment unchanged).

One structural caveat remains: the rate limiter is per-process in-memory (§1) — fine on one instance, must move to Redis before scaling horizontally.

---

## 1. Brute force — PASS

- Login: 5 attempts / 15 min, email-keyed, over argon2id; dummy-hash timing equalizer (no user enumeration).
- **Live:** fresh email → `401 401 401 401 401 429 429`, `Retry-After: 900`. Re-confirmed twice.
- Burst (autocannon 10×10s, one email): 13,693 req, **0 succeeded** — concurrency doesn't bypass.
- Immune to per-request `X-Forwarded-For` spoofing (tested).
- **Caveat:** in-memory store (`shortcut:` in `rateLimit.ts`) — weakens past one app instance. Move to Redis before scaling out.

## 2. SQL injection — PASS (not exploitable)

- All queries parameterized (`$n`); dynamic SQL uses hardcoded column names only.
- **Live payloads** into search (`q`): `x' OR '1'='1`, `'; DROP TABLE users;--`, `' UNION SELECT password_hash FROM users--`:
  - `users` table intact afterward (11 rows — DROP never executed).
  - `OR '1'='1` returned **0 users** (treated as literal, not a filter bypass; baseline is 11).
  - UNION payload leaked **no** hash/password in the response.

## 3. Token & session integrity — PASS

| Test | Result |
|---|---|
| Valid token | `200` |
| No cookie / garbage / empty / `' OR 1=1--` token | `401` |
| Token tampered by 1 char | `401` |
| Revoked session | `401` |
| Expired session (past `expires_at`) | `401` |
| Session of a deactivated user | `401` |
| Raw token in DB? | **No — only SHA-256 hash stored** |
| Cookie flags | `httpOnly`, `sameSite=lax`, `secure` in prod, `path=/` |

## 4. Authorization / IDOR — PASS

- **Endpoint leak sweep:** all **38 GET routes hit with no auth → 0 returned 200.** No unauthenticated data exposure.
- **RBAC live:** admin → `200`; SALESPERSON → `403` on admin-only `audit-logs` and `users`; `roster` returns id/name/role only (no email) to non-admins.
- **IDOR:** SALESPERSON `PATCH /sales/1/payments/1` (owned by another user) → `403`; payment amount unchanged (`50000`). Ownership scoped to `sale_id` + `recorded_by`.

## 5. Malicious input & info leak — PASS

| Attack | Result |
|---|---|
| Path traversal (`..%2f..%2fetc%2fpasswd`) on `[name]`/`[id]` routes | `404` / `400` |
| Malformed JSON body | `400` (not 500) |
| 10 MB junk body | `400` |
| Type confusion (`/api/sales/abc`) | `400`, body `{"error":"Invalid id"}` — no stack trace |
| Response headers | No `X-Powered-By` / server banner leaked |
| CSRF: cross-site POST (`Sec-Fetch-Site: cross-site`) | `403` (same-origin control → `400`, passed gate) |

## 6. Speed / load — PASS

Single-request latency (authed admin):

| Endpoint | ms | Endpoint | ms |
|---|---|---|---|
| users/roster | 6 | tasks | 63 |
| users | 14 | chat/conversations | 72 |
| audit-logs | 15 | leads | 56 |
| notifications | 22 | **payments** | **170 (slowest)** |
| calendar | 35 | sales | 44 |

Under concurrency (autocannon):

| Endpoint | Req/sec | Avg | p99 |
|---|---|---|---|
| `GET /api/leads` | 661 | 29.7 ms | 49 ms |
| `GET /api/sales` | 692 | 28.4 ms | 50 ms |
| `GET /api/audit-logs` | 1,245 | 15.6 ms | 32 ms |
| `GET /api/dashboard/super-admin-summary` | 1,162 | 21 ms | 38 ms |

No errors/timeouts under 20–25-way concurrency. Full vitest suite: **583/583 passing**.

---

## Watch list (not vulnerabilities — operational)

1. **In-memory rate limiter** → Redis before running >1 instance. The one real structural gap.
2. **`/api/payments`** — the earlier 170 ms was a cold-start artifact (Next route compile + pool warmup), **not** the DB. At the real data size (**280k payments / 300k sales**) the list query runs in **1.4 ms**, fully indexed; warm HTTP latency is 23–28 ms. No fix needed.
3. **Search indexes — DONE** (migrations `0039`, `0040`). Leading-wildcard `ILIKE '%…%'` searches were sequential scans on 300k-row tables. Fixed with `pg_trgm` GIN indexes:
   - `0039` — payments search on `sales.company_name` (single column).
   - `0040` — leads + sales list search, option B: one combined trigram index per table over a `coalesce(col,'') || ' ' || …` concatenation, with `leads/list.ts` and `sales/list.ts` rewritten to match that exact expression. Measured on realistic selective searches: **leads 53 ms → 0.13 ms (~400×), sales 38 ms → 0.08 ms (~470×)**; 142 list/migrate tests pass, typecheck clean.
   - Note: trigram helps *selective* searches (few matches). A term matching ~all rows still seq-scans (correctly — an index can't beat a scan when it returns the whole table). Built with plain `CREATE INDEX` (migration runs in a txn, so `CONCURRENTLY` isn't possible) — briefly write-locks the table during build.
4. **Not covered:** write-endpoint load (would pollute data — use a throwaway DB), exhaustive per-field authz matrix on every older route, and `npm audit` dependency-CVE scan.
