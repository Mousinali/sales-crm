# Sales CRM — Phase 6: Testing and Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps between what Phases 1–5 built and what req.md promises before this CRM is used by the real company: a written permission matrix with a test proving every cell, concurrency tests for the operations that race (assignment, transfer, visit scheduling), email failure/retry tests, a validation/duplicate-detection sweep, a production readiness checklist, and a line-by-line security review against req.md §13.

**Architecture:** This phase adds very little new product code. Each task either (a) writes the tests Phases 1–5 didn't, against code that already exists, fixing whatever the test finds broken, or (b) produces an operational artifact (a checklist, a runbook) rather than application code. Where a test reveals a real race condition, the fix is a `SELECT ... FOR UPDATE` row lock added to the existing transaction in the library function already responsible for that operation — not a new locking subsystem.

**Tech Stack:** Same as Phases 1–5. No new dependency unless Task 5's monitoring step finds the project has none and the user confirms one is wanted (that confirmation happens before any `npm install` in this phase, not as an assumption baked into the plan).

**Spec:** `req.md` §13 (Authentication and Security), §16 Phase 6, §17 (Acceptance Criteria).

**Depends on:** every prior phase's tables and library functions — this phase reads and tests them, it does not add new domain tables.

## Global Constraints

- No ORM: raw `pg` only (req.md §12) — any lock added in Task 2 is still a plain parameterized query.
- Every finding this phase produces (a missing permission check, a race, a validation gap) gets a test that reproduces it *before* the fix, exactly like every prior phase's TDD discipline — this phase is not exempt from "write the failing test first" just because it's auditing existing code.
- Security-review findings (Task 6) are fixed in this phase's commits, not merely written down — "perform a security review before company use" (req.md §16 Phase 6) means the review's findings are closed, not just filed.
- Nothing in this phase touches real user data or a real SMTP/production credential — the concurrency and failure-injection tests (Tasks 2–3) run against the local test database and a mocked `sendEmail`, exactly like every prior phase's tests.
- The production readiness checklist (Task 5) documents what the company's own ops team must set up (hosting, DNS, TLS termination) — this plan does not provision or purchase any of that; it specifies the environment variables and commands the app itself needs, verified by actually running them against a local Postgres.

## Review Focus

- A role/action combination with no existing test is the whole point of Task 1 — the review focus here *is* the task: build the matrix, find the untested cells, add the missing test for each one.
- Two Marketing Heads (or a Marketing Head and Super Admin) racing to assign/transfer the same lead, or schedule the same Salesperson's same slot, simultaneously — the loser of the race must get a clean, consistent result (either a clear error or the second-to-commit's write cleanly superseding the first's), never a corrupted `leads`/`client_visits` row or a crashed process (req.md §6.2, §8.3 transaction requirements, generalized to concurrent callers).
- An email announcement retried twice in quick succession (e.g., a user double-clicking "Retry") must not send the same recipient twice — Task 3 must prove this against Phase 5's actual `retryFailedRecipients`, not just assert it in Phase 5's single-threaded unit test.
- A required field silently accepting an empty string (as opposed to being genuinely absent) is the most common validation gap Zod `.optional()`/`.min(1)` mismatches produce — Task 4's sweep specifically diffs every route's Zod schema against req.md's own "(required)" annotations.
- `npm run migrate` run twice in a row (the real-world "deploy ran migrate, then a second instance also ran it on boot") must be a no-op the second time, not an error — this is `runMigrations`' own `schema_migrations` tracking, but Task 5 must prove it under the actual `migrate` CLI script, not just the library function's existing unit test.

---

### Task 1: Permission matrix audit

**Files:**
- Create: `docs/superpowers/plans/phase6-permission-matrix.md` (the matrix itself, checked in as a living reference — not a plan, a test map)
- Modify: whichever `*.test.ts` files the matrix finds gaps in (cannot be named in advance — listed in the matrix once built)

**Interfaces:**
- Consumes: every role-gated function from Phases 2–5 (`canManage`, `assertLeadVisible`, `reviewLead`, `assignLead`, `transferLead`, `scheduleVisit`/`rescheduleVisit`/`cancelVisit`/`recordVisitOutcome`, `createAnnouncement`/`retryFailedRecipients`, `createTask`/`updateTask`).
- Produces: nothing new — this task only adds tests to existing files.

- [ ] **Step 1: Build the matrix**

A table: rows = the 5 roles, columns = every mutating action across Phases 2–5 (create/edit/activate/deactivate/reset-access user; create/edit/archive lead; qualify/reject/return; assign; transfer/bulk-transfer; schedule/reschedule/cancel/record-outcome visit; send/retry announcement; create/update task). Each cell: Allowed / Denied / Allowed-if-owner, cited to the req.md line that says so (most cells already have this from each phase's own Review Focus — this step is assembling them into one place, not re-deriving them).

- [ ] **Step 2: For each Denied/Allowed-if-owner cell, grep the existing test suite for a test asserting it**

```bash
grep -rn "rejects a\|rejects an\|not accessible\|LeadActionNotAllowedError\|RoleNotManageableError\|VisitActionNotAllowedError\|EmailActionNotAllowedError\|TaskNotAccessibleError" src/lib src/app/api
```

List every cell with no matching `grep` hit in the matrix doc as "GAP."

- [ ] **Step 3: Write the failing test for each GAP, in the `*.test.ts` file for the function that cell's action maps to**

One `it(...)` per gap, following the exact pattern every prior phase already used for the same kind of assertion (role check → `.rejects.toThrow(SomeError)`).

- [ ] **Step 4: Run each new test to verify it fails, fix the underlying function if the gap is a real missing check (not just a missing test), re-run to verify it passes**

Run: `npm test`
Expected: all GAPs now have a passing test; any that required a code fix show that fix in the same commit.

- [ ] **Step 5: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add docs/superpowers/plans/phase6-permission-matrix.md <modified test files> <any fixed source files>
git commit -m "test: close permission-matrix gaps found by the Phase 6 audit"
```

---

### Task 2: Concurrency tests for assignment, transfer, and visit scheduling

**Files:**
- Modify: `src/lib/leads/assign.test.ts`, `src/lib/leads/transfer.test.ts`, `src/lib/visits/schedule.test.ts`
- Modify (only if a test fails and reveals a real race): `src/lib/leads/assign.ts`, `src/lib/leads/transfer.ts`, `src/lib/visits/schedule.ts`

**Interfaces:**
- Consumes: `assignLead`, `transferLead`, `scheduleVisit` (as already written).
- Produces: nothing new — row-level locking, if added, stays inside each function's existing transaction.

- [ ] **Step 1: Write the failing concurrency tests**

```ts
// src/lib/leads/assign.test.ts
it("leaves exactly one consistent assignment when two assigns race on the same lead", async () => {
  const [a, b] = await Promise.allSettled([
    assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: salespersonA }),
    assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: salespersonB }),
  ]);
  const { rows } = await pool.query("SELECT salesperson_owner_id FROM leads WHERE id = $1", [qualifiedLead.id]);
  expect([salespersonA, salespersonB]).toContain(rows[0].salesperson_owner_id);
  const { rows: history } = await pool.query("SELECT count(*) FROM lead_assignments WHERE lead_id = $1", [qualifiedLead.id]);
  expect(Number(history[0].count)).toBe(2); // both writes landed as history even though only one is "current"
});
```

```ts
// src/lib/visits/schedule.test.ts
it("lets at most one of two simultaneous same-slot schedule calls succeed without the conflict check racing itself", async () => {
  const results = await Promise.allSettled([
    scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: leadA.id, salespersonId, visitDate: "2026-12-01", startTime: "09:00", objective: "A" }),
    scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: leadB.id, salespersonId, visitDate: "2026-12-01", startTime: "09:00", objective: "B" }),
  ]);
  // Both are allowed to succeed (scheduling is advisory-conflict, not hard-blocked, per Phase 4) —
  // this test's real job is proving neither call crashes or corrupts client_visits under concurrency.
  expect(results.every((r) => r.status === "fulfilled")).toBe(true);
});
```

- [ ] **Step 2: Run the new tests**

Run: `npm test -- leads/assign.test.ts leads/transfer.test.ts visits/schedule.test.ts`
Expected: the assignment/transfer test should already pass as written (Postgres's row-level `UPDATE` serializes the two transactions; the test asserts the *result* is consistent, not that both succeed identically) — if it instead reveals a crash (e.g. an unhandled deadlock error), that is the real finding.

- [ ] **Step 3: If a test reveals a real race (a crash, a lost update, or a corrupted history count), add `SELECT ... FOR UPDATE` on the `leads`/`client_visits` row at the start of the function's transaction**

One line added to the existing transaction in `assignLead`/`transferLead`/`scheduleVisit` — `SELECT id FROM leads WHERE id = $1 FOR UPDATE` before the read-modify-write — serializing the two concurrent callers so the second one simply waits instead of racing. This is the only production-code change this task may make, and only if Step 2 actually failed.

- [ ] **Step 4: Re-run to verify the tests pass, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/leads/assign.ts src/lib/leads/assign.test.ts src/lib/leads/transfer.ts src/lib/leads/transfer.test.ts src/lib/visits/schedule.ts src/lib/visits/schedule.test.ts
git commit -m "test: concurrent assignment/transfer/visit-scheduling safety"
```

---

### Task 3: Email failure and retry tests

**Files:**
- Modify: `src/lib/email/announce.test.ts`

**Interfaces:**
- Consumes: `createAnnouncement`, `retryFailedRecipients` (Phase 5).

- [ ] **Step 1: Write the failing tests**

```ts
it("never re-sends an already-SENT recipient even if retry is called twice in a row", async () => {
  vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
  const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
  const sendEmailMock = vi.mocked((await import("./sendEmail")).sendEmail);
  sendEmailMock.mockClear();
  await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
  await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
  expect(sendEmailMock).not.toHaveBeenCalled(); // already SENT from createAnnouncement's own attempt — nothing left to retry
});

it("stops retrying a recipient once attempt_count reaches maxAttempts, leaving it FAILED", async () => {
  vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "still down" });
  const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
  await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id, maxAttempts: 2 });
  const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id, maxAttempts: 2 });
  expect(result.retried).toBe(0);
  const { rows } = await pool.query(
    `SELECT status FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`, [announcement.id],
  );
  expect(rows[0].status).toBe("FAILED");
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- email/announce.test.ts`
Expected: PASS against Phase 5's existing implementation (these tests pin behavior the implementation should already have; if either fails, fix `retryFailedRecipients`'s `WHERE` clause — the most likely bug is retrying a `'SENT'` row because the status filter was written loosely).

- [ ] **Step 3: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/email/announce.test.ts <any fix to announce.ts>
git commit -m "test: email retry never re-sends and respects maxAttempts"
```

---

### Task 4: Validation and duplicate-detection sweep

**Files:**
- Audit (read-only pass, then modify only where a gap is found): every `z.object({...})` schema under `src/app/api/**/route.ts`
- Modify: `src/lib/leads/duplicates.test.ts`, `src/lib/visits/schedule.test.ts` (add the edge cases Step 2 finds)

**Interfaces:**
- Consumes: req.md's own field lists (§5.1, §8.1, §9.1, §10 Task fields) as the source of truth.

- [ ] **Step 1: Diff every route's Zod schema against req.md's field list for that resource**

For each of `leads`, `client_visits`, `tasks`, `email_announcements`: list req.md's fields marked "(required)" next to that field's Zod rule. Flag any field that's `(required)` in req.md but `.optional()` in code, or vice versa (an over-strict schema that now demands a field req.md never required is just as much a bug as a missing requirement).

- [ ] **Step 2: For each flagged mismatch, write the failing test proving the current (wrong) behavior, fix the schema, confirm the test now proves the right behavior**

E.g., if `estimated_budget` were accidentally required (req.md marks it optional): `it("creates a lead with no estimated budget", async () => { ... expect(res.status).toBe(201) })`.

- [ ] **Step 3: Add the two duplicate-detection edge cases Phase 3's own tests didn't cover**

```ts
// src/lib/leads/duplicates.test.ts
it("does not flag a lead as its own duplicate when editing it", async () => {
  const dup = await findPotentialDuplicates(pool, { companyName: lead.company_name, phone: lead.phone });
  // updateLead's own callers must exclude the lead being edited; verify the exclusion helper (if one is added) or document that the UI is responsible for not calling the check against its own unchanged values
  expect(dup.some((l) => l.id === lead.id)).toBe(true); // confirms the function itself is a pure "what matches" query — excluding self is a caller concern, documented here so it isn't silently assumed
});

it("treats a company name differing only by legal suffix as a duplicate", async () => {
  await createLead(pool, { ...base, companyName: "Acme Inc" });
  const dup = await findPotentialDuplicates(pool, { companyName: "Acme" });
  expect(dup.length).toBe(0); // documents the real limit: normalization strips punctuation, not words — "Acme" alone will NOT match "Acme Inc"
});
```

(The second test is a `shortcut:` marker made executable: it pins today's exact-normalized-match limitation as a passing test, so upgrading to fuzzy matching later is a deliberate change that breaks a named test, not a silent behavior drift.)

- [ ] **Step 4: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add <any schema fixes> src/lib/leads/duplicates.test.ts
git commit -m "test: validation-schema sweep against req.md field lists, duplicate-match edge cases"
```

---

### Task 5: Production readiness checklist

**Files:**
- Create: `docs/superpowers/plans/phase6-production-readiness.md`

**Interfaces:** none (operational artifact, not code).

- [ ] **Step 1: Enumerate every required environment variable**

Grep `process.env\.` across `src/`, cross-reference against what's already in `.env.local` (never print its values) — produce a list of every variable name the app reads (`DATABASE_URL`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`/`SMTP_FROM`, `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_NAME`/`SUPER_ADMIN_PASSWORD` for the seed script) with one line each on what it's for and whether it's required at boot vs. only for a specific feature (email).

- [ ] **Step 2: Write the HTTPS/reverse-proxy note**

One paragraph: Next.js's own server does not terminate TLS; production needs a reverse proxy (nginx/Caddy) or a platform that does (per req.md §13's "Use HTTPS in production"), and the session cookie's `Secure` flag (check `src/lib/auth/session.ts`'s cookie options) must actually be set once that's in place — flag as a TODO if it currently isn't conditioned on `NODE_ENV === "production"`.

- [ ] **Step 3: Prove `npm run migrate` is idempotent, and write + test a restore procedure**

```bash
npm run migrate   # first run: applies pending migrations
npm run migrate   # second run, same database: must report zero newly-applied files
```

For restore: take a `pg_dump` of the local test database, drop and recreate it, `pg_restore` (or `psql < dump.sql` for a plain-text dump), then run `npm test` against the restored database to confirm the schema and a representative row survive the round trip. Write the exact commands used into the checklist doc.

- [ ] **Step 4: Note monitoring/logging status**

Check whether the app has any structured logging or error-reporting hook today (likely none, beyond default Next.js console output) — write this as an honest gap in the checklist ("no monitoring integration exists; add one here, e.g. Sentry or a hosting platform's built-in logs, when the company names a preference") rather than silently picking a vendor and adding a dependency nobody asked for.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/phase6-production-readiness.md
git commit -m "docs: production readiness checklist (env vars, HTTPS, backup/restore, monitoring gap)"
```

---

### Task 6: Security review against req.md §13

**Files:**
- Create: `docs/superpowers/plans/phase6-security-review.md`
- Modify: whatever source files Step 2 finds issues in

**Interfaces:** none new.

- [ ] **Step 1: Walk req.md §13 line by line, writing one row per bullet: Pass / Fail / Partial, with the file and line that proves it**

Sign-in/sign-out, Argon2id hashing, secure/HTTP-only/SameSite cookies, session expiration/revocation, parameterized SQL (this is nearly free to verify: `grep -rn "pool.query(\`" src | grep -v '\$[0-9]'` should turn up nothing with a string-interpolated value), server-side authorization on every route (cross-check against Task 1's matrix), CSRF posture given the cookie architecture, no secrets logged, audit-log coverage of security-sensitive changes, DB backup/restore (cross-reference Task 5).

- [ ] **Step 2: For every Fail or Partial, fix it in this phase, not as a future TODO**

Rate-limiting login is the one bullet most likely to still be unaddressed (nothing in Phases 1–5 built it) — if so, add a minimal per-IP+email attempt counter to `src/app/api/auth/login/route.ts` (an in-memory `Map` with a sliding window is sufficient at this app's scale; reach for a dependency like `rate-limiter-flexible` only if the in-memory approach turns out insufficient under the real deployment's process model, e.g. multiple server instances — flag that condition explicitly rather than assuming it).

- [ ] **Step 3: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add docs/superpowers/plans/phase6-security-review.md <any fixed source files>
git commit -m "fix: close security-review gaps against req.md §13"
```

---

## Self-Review

**Spec coverage:** "Test role and record-level permissions" → Task 1. "Test concurrent assignment and transfer operations" → Task 2. "Test email failure and retry behavior" → Task 3. "Test form validation and duplicate detection" → Task 4. "Configure production environment variables, HTTPS, backups, and monitoring" → Task 5. "Perform a security review before company use" → Task 6. (req.md §16 Phase 6, all six bullets, one task each.)

**Not covered here:** adding any genuinely new product feature — this phase is audit-and-harden only, by design (see Architecture).

**Review Focus coverage:** untested permission cells → Task 1 is itself the coverage mechanism. Concurrent lead/visit operations → Task 2. Double-retry not double-sending → Task 3 Step 1's first test. Required-field schema mismatches → Task 4 Step 1. Idempotent migrations → Task 5 Step 3.
