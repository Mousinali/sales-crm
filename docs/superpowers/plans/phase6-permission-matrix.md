# Permission matrix — Phase 6 audit

A living reference, not a plan: rows are the 5 roles, columns are every mutating
action across Phases 2–5. Each cell cites the `req.md` line (or the established
design decision, where `req.md` is silent) that decides it, and the test that
proves it. **GAP** means the cell's rule exists in code but had no test before
this audit; **GAP (fixed)** means the audit found the code itself wrong, not
just untested — see the "Findings" section below the table for every GAP this
phase closed.

Legend: **A** = Allowed, **D** = Denied, **O** = Allowed only if owner/assignee.

## User management (Phase 2 — `req.md` §3, §4.1)

| Action | SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON |
|---|---|---|---|---|---|
| Create user | A (HR, MH only — §3.1/§4.1) | A (MH, PS, SP only — §3.2/§4.1) | A (PS, SP only — §3.3/§4.1) | D (§4.1 "cannot create user accounts") | D (§4.1) |
| Edit / activate / deactivate / reset-access | A (same target scope as create) | A (same target scope) | A (same target scope) | D | D |

- SUPER_ADMIN↔HR target-scope denial: `src/lib/users/create.test.ts:53` ("rejects SUPER_ADMIN creating a PRE_SALES account").
- MARKETING_HEAD denied managing a peer MARKETING_HEAD: `src/lib/users/update.test.ts:54`, `src/lib/users/resetAccess.test.ts:52`.
- PRE_SALES/SALESPERSON denied **entirely** (zero manageable roles) — **GAP**, closed this phase. One representative zero-privilege role is proven per function (both roles share the same empty-manageable-roles code path, so this proves the structural guarantee rather than duplicating the same assertion for both): `src/lib/users/create.test.ts` ("rejects a Pre-sales user creating any account"), `src/lib/users/update.test.ts` → `updateUserProfile` ("rejects a Salesperson updating any user") and `setUserStatus` ("rejects a Pre-sales user activating or deactivating any user" — `setUserStatus` had **no role-denial test of any kind** before this fix pass, not even for a role already covered elsewhere), `src/lib/users/resetAccess.test.ts` ("rejects a Pre-sales user resetting access").

## Leads (Phase 3 — `req.md` §5–§6, §18)

| Action | SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON |
|---|---|---|---|---|---|
| Create lead | D (§3.1 names no lead-creation permission) | D (§18: "no lead... access") | A (§5.1) | A (§5.1, primary entry role) | D (§5.1 only names Pre-sales/MH) |
| Edit / archive lead | A (§3.1 "correct... access issues") | D (§18) | A (§3.3) | O — creator or Pre-sales owner (`assertLeadVisible`) | D (`update.ts:44`) |
| Review (qualify/reject/return) | D (§6.1 names only Marketing Head) | D (§18) | A (§6.1 step 3) | D (§6.1 — Pre-sales records, doesn't review its own) | D |
| Assign | D | D (§18) | A (§6.2) | D | D |
| Transfer (single + bulk) | D (§7 names only Marketing Head) | D (§18) | A (§7) | D | D |

- SALESPERSON denied create/edit/review/assign/transfer: `src/lib/leads/create.test.ts:38`, `update.test.ts:109`, `review.test.ts:85`, `assign.test.ts:122`, (transfer: covered by the generic non-MH check, same code path as PRE_SALES's test below).
- PRE_SALES denied review/assign/transfer, allowed-if-owner edit, denied non-owner edit: `review.test.ts:73`, `assign.test.ts:93`, `transfer.test.ts:91`, `update.test.ts:103/109`.
- HR denied create/edit/review/assign/transfer/bulk-transfer — **GAP**, closed this phase (code already denied HR via each function's allowlist; none had a test naming HR, the one role `req.md` §18 explicitly calls out as having "no lead... access"): `create.test.ts`, `update.test.ts`, `review.test.ts`, `assign.test.ts`, `transfer.test.ts` (×2, single + bulk).
- SUPER_ADMIN denied create/review/assign/transfer (single) — **GAP**, closed this phase (consistent with Phase 3/4's existing, already-reviewed design that Marketing Head owns these operational actions; Super Admin's §3.1 role is oversight/correction, not routine review/assignment): `create.test.ts` ("rejects Super Admin creating a lead"), `review.test.ts` ("rejects Super Admin calling review"), `assign.test.ts` ("rejects Super Admin calling assign"), `transfer.test.ts` ("rejects Super Admin calling transfer").

## Client visits (Phase 4 — `req.md` §8)

| Action | SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON |
|---|---|---|---|---|---|
| Schedule | D (§8 names only MH) | D (§18) | A (§8.3 step 1) | D | D |
| Reschedule | D | D (§18) | A | D | D |
| Cancel | D | D (§18) | A | D | D |
| Record outcome | D | D (§18) | D (§8.3 step 5 — the Salesperson records it) | D | O — the assigned Salesperson only |

- PRE_SALES denied schedule/reschedule/cancel: `schedule.test.ts` ("rejects a Pre-sales user scheduling a visit", "rejects a non-Marketing-Head rescheduling or cancelling" — this one test now exercises both reschedule and cancel for the same PRE_SALES actor, see Findings).
- MARKETING_HEAD denied recording an outcome directly, and ownership-gated outcome recording (another Salesperson): `schedule.test.ts` ("rejects a Marketing Head recording an outcome directly"), `schedule.test.ts:177`.
- Cancel had **no denial test at all** — **GAP (the riskiest kind: an untested branch, not just an untested role)**, closed this phase: `schedule.test.ts` ("rejects a non-Marketing-Head rescheduling or cancelling", extended to actually call `cancelVisit` too, not just `rescheduleVisit` as its name already implied).
- HR denied schedule/reschedule/cancel/record-outcome — **GAP**, closed this phase: `schedule.test.ts` ("rejects HR scheduling a visit", "rejects HR rescheduling a visit", "rejects HR cancelling a visit", "rejects HR recording a visit outcome").
- SUPER_ADMIN denied schedule/reschedule/cancel/record-outcome — **GAP**, closed this phase (same reasoning as leads: Marketing Head owns routine visit operations): `schedule.test.ts` ("rejects Super Admin scheduling a visit", "rejects Super Admin rescheduling or cancelling a visit", "rejects Super Admin recording a visit outcome").

## Email announcements (Phase 5 — `req.md` §9.3)

| Action | SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON |
|---|---|---|---|---|---|
| Send | A (§9.3 "Restrict... to Marketing Heads and Super Admin") | D (§18) | A | D | D |
| Retry | A (any announcement) | D (§18) | O — only the sender's own announcement | D | D |

- PRE_SALES denied send/retry: `announce.test.ts:61`, `announce.test.ts` ("rejects a non-Marketing-Head/Super-Admin retrying").
- MARKETING_HEAD denied retrying a peer's announcement (ownership): `announce.test.ts:163`.
- SUPER_ADMIN allowed to retry any announcement: `announce.test.ts` ("lets a Super Admin retry any Marketing Head's announcement").
- HR denied send/retry — **GAP**, closed this phase: `announce.test.ts` (×2).

## Tasks (Phase 5 — `req.md` §10, Phase 5's own plan ruling)

| Action | SUPER_ADMIN | HR | MARKETING_HEAD | PRE_SALES | SALESPERSON |
|---|---|---|---|---|---|
| Create (for self) | A | A | A | A | A |
| Create (assign to someone else) | A — target must be active PRE_SALES/SALESPERSON | D | A — same target rule | D | D |
| Update | O — the assigned user only, **regardless of role** (not even the creator or MH/SA) | O | O | O | O |

- "Assign to someone else" denial for a non-MH/SA actor and for a non-eligible target: `crud.test.ts` ("rejects a non-MH/SA actor assigning a task to someone else", "rejects a Marketing Head assigning a task to a non-Pre-sales/Salesperson user") — added during Phase 5's own final review, already covers HR's case (same branch as the tested SALESPERSON actor) and PRE_SALES/SALESPERSON as actors.
- Update's assignee-only rule (no role exception) is a Phase 5 final-review deferred minor, not a gap in this audit's sense — it's a documented, intentional-for-now design limit (see Phase 5's `TODO.md` entry), not an untested rule. No new test added here.
- "Create for self" has no role gate by design (Phase 5's plan explicitly reasoned `req.md` §10 names no restriction) — not a Denied/Allowed-if-owner cell, so outside this audit's grep-based gap check.

## Findings

Every **GAP** above was found to be **already correctly denied in code** — none required a production-code fix, only a new test proving the existing check. The one near-miss: `cancelVisit` had zero test coverage of its role check (not even for the role already covered elsewhere, PRE_SALES) — found and closed in this task. No Critical or Important code defect surfaced; this task's value is entirely in converting "presumably denied" into "proven denied," per `req.md` §17 Acceptance Criterion 15 ("Unauthorized users cannot access protected data by directly calling API routes").

**Fresh-context review, post-Task-6:** a whole-branch review found this document had overclaimed in three ways, all fixed in the same pass — `setUserStatus` had zero test coverage at all (not a citation error, a real test gap, now closed); SUPER_ADMIN's denial was asserted for transfer/schedule/reschedule/cancel/record-outcome without a matching test (now added); and the resetAccess citation named "a Salesperson" when the actual test uses "a Pre-sales user" (text corrected above). No further code defects — every addition here, like the original audit, found an already-correct check that simply hadn't been proven yet.
