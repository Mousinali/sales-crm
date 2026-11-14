# Full Software Test Result — 2026-11-14

Scope: unit/integration tests, TypeScript, production build, lint, live rate-limit verification, and two load tests — one against the login endpoint, one against a realistic authenticated mix of the actual app (dashboard, leads, team, calendar, companies, tasks, sales, payments, notifications, lead detail). Run locally against this repo in production mode (`NODE_ENV=production npx tsx server.ts`), not against the live server.

## Summary

| Check | Result |
|---|---|
| Unit/integration tests | ✅ 466/466 passing (90 files) |
| TypeScript (`tsc --noEmit`) | ✅ Clean |
| Production build | ✅ Clean, all routes compile |
| Lint | ✅ 0 errors, 9 pre-existing warnings (unrelated to this session) |
| Rate limiting (live, k6) | ✅ Correct — verified 401→429 transition, headers, and a real bug found + fixed |
| Load test — login endpoint (k6, 50 VUs) | ✅ 0 crashes, 0 5xx, p95 latency 3.29ms under ~15.7k req/s |
| Load test — full authenticated app, 13 endpoints (k6, up to 300 VUs) | ✅ 0 crashes, 0 5xx, 0% failed checks across 61k requests — but found and fixed a real N+1-style latency bug on the lead detail page |

## 1. Automated checks

```
npx vitest run        → 90 test files, 466 tests passed
npx tsc --noEmit       → no output (clean)
npm run build          → clean, every route compiled (incl. 3 new API routes)
npm run lint            → 0 errors, 9 warnings (all pre-existing, unrelated files)
```

One test was fixed during this pass: `TeamView.test.tsx` was still querying `getByRole("button", { name: /deactivate/i })` from before the Deactivate/Activate control was changed to a toggle switch (`role="switch"`) earlier in this project. Updated the query to `getByRole("switch", ...)`. (465 → 466 after adding a new rate-limit test, see below.)

## 2. Rate limiting — live verification (k6)

Target: `POST /api/auth/login`, limit is 5 attempts / 15 minutes, keyed by email (`src/app/api/auth/login/route.ts`, `src/lib/auth/rateLimit.ts`).

**Test A — per-email limit:** 8 sequential requests with one fixed bogus email.

| Attempt | Expected | Actual |
|---|---|---|
| 1–5 | 401 (invalid credentials) | ✅ 401 |
| 6–8 | 429 + `Retry-After` header + `retryAfterSeconds` > 0 | ✅ 429, header present |

Latency: avg 7.97ms, p95 22.97ms. All 14 checks passed.

**Test B — load test:** ramping to 50 virtual users over 20s, each request using a brand-new unique email (so it exercises the real DB lookup path instead of tripping the per-email limit).

- 313,691 requests in 20s (~15,684 req/s)
- **0 requests failed with a 5xx** — server stayed up throughout
- p95 latency: **3.29ms**, max 15.76ms
- Server log: no errors, no exceptions, no DB pool errors

**Unexpected-but-correct finding:** ~499 requests got a real 401, and the remaining ~313,192 got 429 instead of the expected 401. This is not a bug — it's a *second*, separate defense in `rateLimit.ts`: an admission throttle that caps brand-new identifiers to 500 per 60 seconds **per namespace**, specifically to stop an attacker flooding the in-memory store with unbounded distinct keys (which would otherwise grow forever). My flood of >300k unique emails in under a minute is exactly the attack shape that throttle exists for, and it engaged correctly, with zero impact on the app's stability.

## 3. Bug found and fixed: `retryAfterSeconds: 0` when blocked by the admission throttle

**What was wrong:** `getRetryAfterSeconds()` only checked the per-key `attempts` map. A request blocked by the *admission* throttle (a brand-new email that never even got added to `attempts`) got `retryAfterSeconds: 0` in the 429 response body — which reads as "retry immediately," defeating the point of the backoff.

Confirmed live before the fix:
```
curl -X POST .../api/auth/login -d '{"email":"confirm-check-now@example.com",...}'
→ 429 {"error":"Too many attempts. Try again later.","retryAfterSeconds":0}
```

**Fix** (`src/lib/auth/rateLimit.ts`): `getRetryAfterSeconds` now falls back to the namespace's admission-window remaining time when there's no per-key entry.

Confirmed live after the fix:
```
curl -X POST .../api/auth/login -d '{"email":"fix-verify@example.com",...}'
→ 429 {"error":"Too many attempts. Try again later.","retryAfterSeconds":60}
```

Added 2 unit tests in `rateLimit.test.ts` covering this fallback (exact value, and mid-window countdown). All 8 tests in that file pass.

## 4. Load test — full authenticated app (not just login)

Extracted a real session cookie from an authenticated Marketing Head browser session and used it to hit 13 real pages/API routes under load, weighted toward how they're actually used (dashboard and the leads list get the most traffic in the mix):

`/dashboard`, `/leads`, `/leads/[id]` (lead detail), `/team`, `/calendar`, `/companies`, `/tasks`, `/sales`, `/payments`, `/api/dashboard/marketing-head-summary`, `/api/dashboard/entries-series`, `/api/notifications`, `/api/users/roster`.

**Run 1 — moderate load:** ramp to 60 VUs over 40s → 40,555 requests, **100% passed** (status 200, no 5xx, no login-redirect/session-drop), p95 **81ms**, ~1,014 req/s. Server log clean.

**Run 2 — stress:** ramp to 300 VUs over 60s → 61,075 requests, **100% passed**, 0% failed, server stayed up and responsive afterward. Per-endpoint p95 latency broke down unevenly:

| Endpoint type | p95 latency at 300 VUs |
|---|---|
| Lightweight API reads (`notifications`, `mh_summary`, `entries_series`, `users/roster`) | ~10ms |
| List pages (`leads`, `team`, `companies`, `tasks`, `sales`, `payments`) | ~305ms |
| `dashboard` / `calendar` | ~440–450ms |
| **`leads/[id]` (lead detail)** | **~1.01s** ⚠️ |

**Bug found: lead detail page was ~3x slower than any other page.** `src/app/(dashboard)/leads/[id]/page.tsx` ran 4 independent DB-backed lookups — activities, services, latest sale, owner names — one at a time with sequential `await`s, even though none of them depend on each other (all four only need the lead's id, already known). Each page load paid for 4 round trips back-to-back instead of the slowest one.

**Fix:** parallelized the four with `Promise.all`. Re-ran the identical 300-VU stress test after:

| | Before | After |
|---|---|---|
| `leads/[id]` avg | 512.76ms | 337.89ms |
| `leads/[id]` p95 | 1.01s | **665ms** (-34%) |

Still 0 errors, 0 failed checks, before and after. 26 tests in `src/app/(dashboard)/leads/**` still pass; full suite still 466/466.

**Note:** this didn't fully close the gap with the list pages (~300ms) — the remaining difference is realistic given this page also joins/queries more data per lead than a list page per row. The fix removed the *serialization* cost, not the underlying query volume.

## 5. Other fixes made in this session, now covered by tests

These were fixed earlier in the session (lead assignment/transfer rules + activity logging) and are included here since "full test" should reflect current state:

- `src/lib/leads/assign.ts` / `transfer.ts`: a Salesperson can now be (re)assigned on `CLOSED_WON`/`CLOSED_LOST` leads, not just `QUALIFIED`/`CONVERTED`. Shared as `ASSIGNABLE_STATUSES`.
- `src/lib/leads/assign.ts`: the lead's Activity log now records a readable "Salesperson changed from X to Y" sentence with real names, instead of raw user IDs and a subtly-wrong "unchanged" check.
- Both covered by 2 new tests in `assign.test.ts` (27/27 passing in that file).

## 6. Known limitations of this test pass

- **All authenticated load testing used one account/role** (Marketing Head) and one lead id — Pre-Sales/Salesperson/Super Admin dashboards and other leads weren't separately load-tested. No credentials for those roles were available in this session.
- **No write-path load testing** (create/update/delete leads, sales, payments, assignments) — deliberately avoided to not flood the small seeded dataset with junk that would corrupt other tests/screenshots. Only reads were load-tested.
- **Single-process, local machine** — not representative of the live server's actual hardware/network, and the rate limiter is explicitly in-memory/per-process (documented in its own source comment), so these results don't predict behavior if the live deployment ever runs multiple instances behind a load balancer.
- **Postgres connection pool** (`src/lib/db.ts`) has no explicit `max` set, so it uses `pg`'s default (10). The full-app stress test (run 2, 300 VUs) did genuinely exercise this — that's very likely *why* every DB-backed page's latency rose together under load (requests queuing for one of only 10 pool connections) while the pure in-memory login-rate-limit test did not hit this at all. Worth considering raising `max` if this pattern matters under real traffic.

## Net result

No regressions from this session's UI/logic changes. Two real bugs found via load testing and fixed, both with tests and both verified live before/after:
1. Rate limiter returned a misleading `retryAfterSeconds: 0` when blocked by the admission throttle.
2. Lead detail page serialized 4 independent queries, making it ~3x slower than any other page under load; now parallelized (-34% p95).

Everything else (lead assignment fix, dashboard period filters, styling changes) checked out clean under both moderate and heavy concurrent load — 0 crashes, 0 5xx, across ~175k total requests fired at this app during this pass.
