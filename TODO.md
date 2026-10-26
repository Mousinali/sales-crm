# Sales CRM — TODO

Tracking against `req.md` §16 (Implementation Plan). Status as of 2026-10-26.

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

## Phase 3 — Leads and review (not started)

- [ ] Lead creation and editing
- [ ] Search, filters, duplicate warnings
- [ ] Lead activity history
- [ ] Lead review and qualification statuses
- [ ] Assignment to salespeople + assignment history

## Phase 4 — Transfers and visits (not started)

- [ ] Lead transfer with reason + history
- [ ] Client visit scheduling and outcomes
- [ ] Assignment/transfer/visit notifications

## Phase 5 — Emails, tasks, and reports (not started)

- [ ] Marketing Head email announcements
- [ ] Delivery logs + safe retry handling
- [ ] Tasks, follow-ups, reminders
- [ ] Role-specific dashboards and reports

## Phase 6 — Testing and deployment (not started)

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
