# Sales CRM — TODO

Tracking against `req.md` §16 (Implementation Plan). Status as of 2026-10-26.

**Branch note:** Phase 3 below is implemented only on the worktree branch
`worktree-phase3-6-crm-build` (not yet merged to `main`). `API.md` at the
repo root documents the full API as it stands on this branch, including
the Phase 3 endpoints `main` does not yet have.

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

## Phase 3 — Leads and review ✅ done (on this branch, not merged to main)

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

## Phase 4 — Transfers and visits (in progress — stopped early, resume next session)

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase4-transfers-visits.md`

- [ ] Lead transfer with reason + history
- [ ] Client visit scheduling and outcomes
- [ ] Assignment/transfer/visit notifications
- **Where it stopped:** mid-Task-1 (notifications table). Two uncommitted,
  untracked files only: `migrations/0009_create_notifications_table.sql`
  and `src/lib/notifications/record.test.ts` (test written, no
  implementation yet, not yet run). No Phase 4 code is committed.

## Phase 5 — Emails, tasks, and reports (planned, not implemented)

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase5-emails-tasks-reports.md`

- [ ] Marketing Head email announcements (adds the `nodemailer` dependency)
- [ ] Delivery logs + safe retry handling
- [ ] Tasks, follow-ups, reminders
- [ ] Role-specific dashboards and reports

## Phase 6 — Testing and deployment (planned, not implemented)

Plan: `docs/superpowers/plans/2026-10-26-sales-crm-phase6-testing-deployment.md`

- [ ] Role and record-level permission tests
- [ ] Concurrent assignment/transfer tests
- [ ] Email failure/retry tests
- [ ] Form validation + duplicate-detection tests
- [ ] Production env vars, HTTPS, backups, monitoring
- [ ] Security review before company use

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
