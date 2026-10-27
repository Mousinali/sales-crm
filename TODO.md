# Sales CRM — TODO

Tracking against `req.md` §16 (Implementation Plan). Status as of 2026-10-27.

Phases 1–6 are merged to `main`. `API.md` at the repo root documents the
full API as it stands. Phase 6 added no new endpoints — it audited and
hardened Phases 1–5's existing ones (see Phase 6's entry below for what
it found and fixed).

## Phase 1 — Project foundation ✅ done

- [x] Next.js App Router + TypeScript
- [x] PostgreSQL + `pg`, SQL migration workflow
- [x] Authentication, sessions, role checks
- [x] Shared dashboard layout

## Phase 2 — User management ✅ done

- [x] Super Admin creates HR accounts (and Marketing Head accounts directly)
- [x] HR creates Marketing Head, Pre-sales, and Salesperson accounts
- [x] Marketing Heads create Pre-sales and Salesperson users
- [x] User list, edit, activate/deactivate, secure access reset
- [x] Shared team visible to both Marketing Heads
- [x] Security-hardening pass committed:
  - `revokeAllSessions()` on access reset / deactivation
  - `requireUser()` redirect to `/change-password` when `mustChangePassword` is set
  - 403 on `/api/users*` mutations while `mustChangePassword` is set
  - `layout.tsx` hydration-warning fix
- [x] HR role inserted into the hierarchy (`migrations/0005_add_hr_role.sql`,
  `src/lib/auth/roles.ts`), `req.md` updated to match
- [x] Dashboard shell and Team page redesign (dark nav rail, role-colored
  badges, avatar initials)
- All tests passing (63/63), `tsc --noEmit` clean

## Phase 3 — Leads and review ✅ done

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase3-leads.md`

- [x] Lead creation and editing (incl. one-way archive)
- [x] Search, filters, duplicate warnings (advisory, role-gated, minimal-projection)
- [x] Lead activity history (`lead_activities`, manual + auto-logged)
- [x] Lead review and qualification statuses (qualify/reject/return, reason required)
- [x] Assignment to salespeople + assignment history (`lead_assignments`,
  transactional, status-gated per req.md §6.1)
- [x] Migrations `0006`–`0008` (`leads`, `lead_activities`, `lead_assignments`)
- [x] Full UI: Leads list/search/filter/create (`/leads`), lead detail with
  inline edit, review actions, assignment panel, activity log (`/leads/[id]`)
- [x] Fresh whole-branch review (opus) — no Critical findings; all
  before-Phase-4-blocking Important findings fixed in a follow-up commit
  (assignment status-gate scope, inactive users in assignment dropdowns,
  broken date-range filter, placeholder-website duplicate-match bug, test
  coverage gaps). Deferred to a pre-handback polish pass (not blocking):
  archive-action completeness (no UI button/activity log entry yet, archived
  leads still mutable), a few spec fields missing from the create/detail UI
  (designation, industry, location, budget, follow-up date), a clear-field
  edit bug, activity-timeline readability, and a "return for more info" path
  back to Pending Review. Full detail in the Phase 3 commit messages.
- All tests passing (142/142), `tsc --noEmit` clean, `next build` clean
- [x] Post-launch addition (2026-10-27): extended lead record with
  `business_type`, `address`, `state`, `pincode`, `country` (default
  India), `whatsapp_number`, `remarks` (migration `0012`), exposed on
  both the create and edit forms, plus `req.md` §5.1/`API.md` updated.
  `industry`/`location`/`estimated_budget`/`designation`/follow-up date
  remain deferred from the note above (industry is now surfaced in the
  UI as "Industry type"; the rest are still backend-only).
- [x] Post-launch addition (2026-10-27): "Service interested" is now a
  searchable multiselect (new `MultiSelectSearch` component) backed by a
  company-wide `services` master list (migration `0013`), not free text.
  New `/services` page lets a Super Admin add/edit/activate/deactivate
  services; `GET/POST /api/services`, `PATCH /api/services/[id]`. Leads
  reference services through a `lead_services` join table; the old
  `service_requirements` column is nullable and no longer written to.
  `req.md` §5.1 and `API.md` updated. A security-review pass caught and
  fixed a real bug: a non-Super-Admin could read inactive services by
  passing `?status=INACTIVE` explicitly — the role now pins the filter
  regardless of what's requested.

## Phase 4 — Transfers and visits ✅ done

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase4-transfers-visits.md`

- [x] In-app notifications (`notifications` table), wired into assignment,
  transfer, and visit scheduling/reschedule/cancel
- [x] Lead transfer (single + bulk) with required reason and history
  (`lead_transfer_history`), gated on the same Qualified/Converted check
  as assignment, and reassigning the lead's upcoming visits to a new
  Salesperson owner
- [x] Client visit scheduling with same-slot conflict detection — enforced
  server-side (409 + explicit `confirmConflict` to proceed), not just an
  advisory UI warning
- [x] Visit reschedule/cancel (status-gated: only while Scheduled/
  Rescheduled) and outcome recording by the assigned Salesperson
- [x] Migrations `0009`–`0011` (`notifications`, `lead_transfer_history`,
  `client_visits`)
- [x] Full UI: notifications bell, Transfer action + visits panel
  (schedule/reschedule/cancel/outcome) on the lead detail page, bulk
  transfer with row selection and a confirmation step on `/leads`
- [x] Fresh whole-branch review (opus) — 1 Critical (conflict check wasn't
  actually enforced), 7 Important (reschedule/cancel missing the same
  status gate as outcome recording; reschedule skipping the conflict and
  active-Salesperson checks; transfer/reschedule notifications untested;
  upcoming visits not reassigned on transfer; reschedule/cancel had no UI;
  bulk-transfer selection going stale after a filter change) — all fixed
  in a follow-up commit, each with a RED→GREEN test. Deferred to a future
  polish pass (not blocking): no-op transfers allowed, duplicate lead ids
  in bulk transfer, unvalidated visit date/time strings (500 instead of
  400 on malformed input), a few transaction-boundary and concurrency
  nitpicks matching Phase 3's existing patterns, vague bulk-transfer error
  messages, a basic notifications bell (no live refresh, no lead links),
  and some untested edge-case combinations (wrong-role transfer target,
  HR calling transfer/visit routes, bulk rollback-on-one-bad-lead).
- All tests passing (200/200), `tsc --noEmit` clean, `next build` clean

## Phase 5 — Emails, tasks, and reports ✅ done

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase5-emails-tasks-reports.md`

- [x] Marketing Head/Super Admin email announcements (adds the `nodemailer`
  dependency) — compose to one user, selected users, or all active
  Pre-sales/Salespeople; recipients resolved to exactly the active,
  eligible set at send time (not a stale or caller-supplied list)
- [x] Per-recipient delivery logs (`email_announcements`, `email_recipients`,
  `email_logs`) with PENDING/SENT/FAILED/RETRYING states and a manual,
  atomic-claim "Retry failed" action (never re-sends an already-SENT row,
  safe under concurrent retries)
- [x] Personal tasks/follow-ups (`tasks` table) — any role may create a
  task for themselves; only Marketing Head/Super Admin may assign one to
  someone else, and only to an active Pre-sales/Salesperson; an optional
  linked lead is checked against the creator's own lead visibility
- [x] Role-specific dashboards replacing the Phase 2 placeholder welcome
  card — Super Admin, Marketing Head, Pre-sales, Salesperson each get the
  widgets `req.md` §11 lists for that role (HR keeps the minimal welcome
  card, having no lead/task/email data of its own)
- [x] Migrations `0014`–`0015` (`email_*` tables, `tasks`)
- [x] Full UI: `/announcements` (compose modal, history table with
  per-recipient status, Retry failed), `/tasks` (filterable list, inline
  Start/Complete/Cancel, new-task modal with an Assign-to picker shown
  only to Marketing Head/Super Admin), `/dashboard` rebuilt per role
- [x] Fresh whole-branch review (opus) — no Critical findings. Important,
  fixed in a follow-up commit: task due-date buckets (overdue/today/
  upcoming) included completed/cancelled tasks forever; task assignment
  and the optional `leadId` link had no server-side check, only the UI
  hid the controls (`req.md` §3.6: "do not rely only on hiding UI
  controls" — also independently caught by an automated security-review
  hook); Super Admin/Marketing Head "upcoming visits" silently dropped
  rescheduled visits (inconsistent with the Salesperson dashboard's own
  query). Also added while in there: Marketing Head's "leads by assigned
  Pre-sales user and Salesperson" breakdown (`req.md` §11.2, named in the
  spec but missed by the plan). Deferred to a future polish pass (not
  blocking): day-boundary bucketing depends on the DB server's timezone
  (a pre-existing pattern already shared with Phase 4's visit queries,
  not unique to this phase); "Leads created over time" and "Team activity
  summary" (§11.1/§11.2, vague in shape, would need their own design
  pass); synchronous SMTP sending has no rate limit and an
  interrupted/timed-out send leaves some recipients un-rowed and others
  stuck `PENDING`/`RETRYING` (the plan already ruled out a queue/scheduler
  for this phase); a Marketing Head can't edit/cancel a task they
  assigned to someone else, and the Tasks UI has no assignee column for
  team view; `completed_at` isn't cleared on a status change away from
  COMPLETED; a zero-recipient send still reports success; no error UI on
  a failed retry/status-change; no length limits on announcement/task
  text fields; `sendEmail.ts`'s `SMTP_PORT`/`secure` handling and
  `.env.example` documentation gaps; archived-lead inclusion is
  inconsistent across the four dashboards' lead counts.
- All tests passing (295/295, stable over repeated full-suite runs),
  `tsc --noEmit` clean, `next build` clean

## Phase 6 — Testing and deployment ✅ done

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase6-testing-deployment.md`

This phase is audit-and-harden only (no new features) — its tasks tested
existing Phase 1–5 code and fixed what they found.

- [x] Role and record-level permission tests — a full role × action matrix
  across Phases 2–5 (`docs/superpowers/plans/phase6-permission-matrix.md`),
  closing every gap it found. Every GAP cell was already correctly denied
  in code (just unproven) except one real omission: `setUserStatus` had no
  role-denial test at all.
- [x] Concurrent assignment/transfer tests — found and fixed a real,
  100%-reproducible double-booking race in `scheduleVisit`/`rescheduleVisit`
  (the conflict check and the write weren't atomic), closed with a Postgres
  advisory lock. Also found, in the final review pass, that
  `transferLead`/`assignLead` read the lead's current owners before
  opening their transaction with no row lock, letting two concurrent
  transfers corrupt `lead_transfer_history`'s audit trail — fixed with
  `SELECT ... FOR UPDATE`.
- [x] Email failure/retry tests — both new tests passed immediately against
  Phase 5's existing `retryFailedRecipients`.
- [x] Form validation + duplicate-detection tests — found `visitDate`/
  `startTime`/`objective` accepted empty and malformed strings, crashing
  Postgres with a raw 500 instead of a clean 400 (and a non-padded time
  like "9:00" would have hashed to a different advisory-lock key than
  Postgres's normalized value, silently defeating the double-booking
  lock above). Fixed with strict format validation on both routes.
- [x] Production env vars, HTTPS, backups, monitoring —
  `docs/superpowers/plans/phase6-production-readiness.md`. Verified
  migration idempotency and a `pg_dump`/`pg_restore` round-trip against a
  disposable database. Monitoring/logging recorded as a genuine gap, not
  filled with an unrequested dependency.
- [x] Security review before company use —
  `docs/superpowers/plans/phase6-security-review.md`, walking `req.md` §13
  line by line. One real Fail: no rate limiting existed anywhere (login or
  change-password). Fixed with `src/lib/auth/rateLimit.ts`, an in-memory
  fixed-window limiter keyed by email (login) or the session's own user id
  (change-password) — never by a client-supplied value. This module went
  through six rounds of hardening in the final review (each round's
  automated security check found a fresh angle on the same root problem:
  any eviction rule based on a key's own state is gameable by an attacker
  who can manufacture distinct keys). The final design evicts nothing; it
  bounds the store by throttling new-identifier admission per namespace
  (500/60s), which protects every identifier already being tracked
  unconditionally. Residual, documented-not-silent risk: a same-namespace
  volumetric flood can delay *brand-new* identifiers in that one namespace
  for up to 60s — the accepted cost of an in-memory, single-process
  limiter (upgrade path: a shared store with real TTLs, e.g. Redis, named
  in the module's own comment).
- [x] Fresh whole-branch review (opus) — 5 Important findings, all fixed:
  the login rate limiter (pre-final-redesign) was keyed by a spoofable
  `X-Forwarded-For` header with no trusted-proxy convention to anchor it
  to; `change-password` had no rate limit at all (a second, unthrottled
  password oracle for anyone holding a stolen session cookie); the
  visit-date/time validation gap above; the transfer/assign audit-trail
  race above; and the permission-matrix doc overclaiming coverage it
  didn't have (now corrected, with the one real missing test added).
- All tests passing (339/339 in isolation and in most full-suite runs),
  `tsc --noEmit` clean, `next build` clean.
- **Known issue, diagnosed not fixed:** `src/lib/email/announce.test.ts`
  fails intermittently under the full parallel suite (always passes in
  isolation). Root cause confirmed, not guessed: Postgres's
  `max_connections` is 100; `src/lib/db.ts`'s pool has no explicit `max`
  (pg's default is 10); Vitest runs with `isolate: true`, so each of the
  now-69 test files gets its own process and its own pool — up to 690
  potential connections against a 100-connection ceiling. Not fixed here:
  both correct fixes (capping each pool's `max`, or `isolate: false`) risk
  side effects outside this phase's scope — a low per-pool cap could
  serialize this phase's own concurrency tests (which need 2+ genuinely
  simultaneous connections to exercise a real race), and `isolate: false`
  changes module-sharing semantics for every test file in the project.
  Needs a dedicated follow-up.

## Phase 7 — Internal chat (planned, not implemented)

Requirement: `req.md` §19 (added 2026-10-27, not yet scheduled when first
proposed — placed last here since no plan doc exists yet).

- [ ] Direct (one-to-one) messaging between any two users visible to each
  other under §3's visibility rules
- [ ] Group conversations
- [ ] Optional lead-linked conversations, surfaced in that lead's activity
  history
- [ ] In-app notification on new message (reusing Phase 4's `notifications`
  mechanism)
- [ ] Append-only message log (no edit/delete in the first release)
- No plan doc yet — needs one under `docs/superpowers/plans/` before
  implementation starts, same as every other phase.

## Known issues / notes

- Dev server (Turbopack) can go stale after heavy file churn across a long
  session and 404 on routes that exist on disk — restart `npm run dev` if
  API routes start 404ing unexpectedly.
- Import convention (adopted mid-Phase-3): use the `@/*` → `./src/*` alias
  (already configured in `tsconfig.json` and `vitest.config.ts`) for any
  import that crosses directories, e.g. `@/lib/leads/types`. Same-directory
  sibling imports (`./types`, `./errors`) stay relative. A filesystem path
  passed to `path.join(__dirname, ...)` (e.g. to locate `migrations/`) is
  not a module import and stays relative too.
- `npm test` can intermittently fail a handful of `src/lib/email/announce.test.ts`
  tests under the full parallel suite (always passes run alone) — see
  Phase 6's entry above for the diagnosed root cause (Postgres connection-pool
  exhaustion across 69+ per-file pools, not a logic bug). If you see this,
  re-run; don't chase it as a regression.
