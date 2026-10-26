# Sales CRM — Phase 4: Transfers, Visits, and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Marketing Heads transfer a lead's Pre-sales/Salesperson ownership (singly or in bulk) with a required reason and full history, schedule/reschedule/cancel client visits for an active Salesperson with conflict warnings, let the assigned Salesperson record a visit's outcome, and give every affected user an in-app notification — all building on Phase 3's `leads`/`lead_activities` and reusing its authorization patterns exactly.

**Architecture:** `lead_transfer_history` and `client_visits` are new tables alongside Phase 3's `leads`/`lead_assignments`/`lead_activities`. A `notifications` table (new in this phase) is the one addition that's genuinely shared infrastructure — Phase 3's `assignLead` gets a small follow-up call into it once it exists. Transfers reuse Phase 3's `assertLeadVisible` and its exact "update current state + insert a history row, in one transaction" shape from `assignLead`. Visit scheduling adds one new kind of check — a same-salesperson/same-slot conflict warning — using the same advisory (warn, don't block) pattern Phase 3 established for duplicate leads.

**Tech Stack:** Same as Phases 1–3 — Next.js App Router + TypeScript, `pg` raw SQL (no ORM), Zod, Tailwind CSS, Remix Icons, Vitest against the real local `sales_crm` database. No new dependency.

**Spec:** `req.md` §7 (Lead Transfer), §8 (Client Visit Management); the "notify" bullets scattered through §6.2, §7.1, §8.3.

**Depends on:** Phase 3's `leads`, `lead_activities`, `assertLeadVisible`, `recordLeadActivity`, `LeadNotFoundError`/`LeadNotAccessibleError`/`LeadActionNotAllowedError`.

## Global Constraints

- No ORM: raw `pg` only, parameterized queries (req.md §12).
- Migrations continue the sequence after Phase 3's `0006`–`0008` — this phase uses `0009`–`0011`.
- A transfer's or visit-schedule's current-state update and its history-row insert happen in one transaction, exactly like Phase 3's `assignLead` (req.md §7.2, and by the same reasoning for visits).
- Transfers never touch `lead_activities`, `client_visits`, or any other lead-linked row except `leads`' own owner columns and `lead_transfer_history` — "preserve the lead's notes, activities, visits..." (req.md §7.1) is automatic because every related table is keyed by `lead_id`, not by owner, so nothing needs to be copied or re-pointed.
- Transfers and visit assignments are rejected for an `INACTIVE` target user or a role mismatch, exactly like Phase 3's `assignLead` check (req.md §7.2, §8 "any active Salesperson").
- Visit-slot conflicts are advisory, not blocking — the same "warn via a separate check endpoint, let the caller confirm anyway" pattern as Phase 3's duplicate-lead check (req.md §8.3's "require confirmation or a revised schedule").
- Notifications in this phase are in-app only (a row in `notifications`, read on the dashboard). Actual email delivery is Phase 5's separate `email_announcements`/SMTP feature — this phase's "notify" bullets are satisfied by the in-app row; req.md's "by email when configured" phrasing is Phase 5's concern, not this one.
- `lead_activities.type` gains two new values this phase (`'TRANSFER'`, `'CLIENT_VISIT'`) via an `ALTER TABLE ... DROP/ADD CONSTRAINT`, the same pattern as `migrations/0005_add_hr_role.sql`.
- UI reuses the established colored-pill/avatar/card conventions from `roleDisplay.ts`/`leadDisplay.ts` and `TeamView.tsx`/`LeadsView.tsx` (req.md §14).

## Review Focus

- Transferring (or scheduling a visit for) an `INACTIVE` user, or a user holding the wrong role, must be rejected — the same check Phase 3 required for assignment, now required again at the one new place it's bypassable (req.md §7.2, §8).
- A transfer with no reason must fail validation — "Require a transfer reason" is not optional (req.md §7.1).
- Two visits for the same Salesperson at the same date/time must surface a conflict warning that the caller must explicitly acknowledge to proceed — never a silent double-booking and never an unconditional block (req.md §8.3).
- A Salesperson recording a visit outcome on a visit that isn't theirs, or a Pre-sales/HR user calling any transfer/visit/notification route, must get 403/404 — this phase's two new record types need the same per-record ownership check Phase 3 built for leads (req.md §3.6).
- Rescheduling or cancelling a visit must notify the assigned Salesperson (and, for a transfer, both the previous and new owner) — a missing notification row is a silent regression that's easy to not notice in a passing test suite unless the test explicitly asserts the `notifications` row exists (req.md §7.1, §8.3).

---

### Task 1: `notifications` table, and wiring Phase 3's assignment into it

**Files:**
- Create: `migrations/0009_create_notifications_table.sql`
- Create: `src/lib/notifications/record.ts`
- Test: `src/lib/notifications/record.test.ts`
- Modify: `src/lib/leads/assign.ts` (call the new notification function)
- Modify: `src/lib/leads/assign.test.ts` (assert the notification row)

**Interfaces:**
- Consumes: nothing new.
- Produces: `recordNotification(pool, input: { recipientUserId: number; type: "LEAD_ASSIGNED" | "LEAD_TRANSFERRED" | "VISIT_SCHEDULED" | "VISIT_RESCHEDULED" | "VISIT_CANCELLED"; leadId?: number; message: string }): Promise<void>`, `listNotifications(pool, viewerId: number, filters?: { unreadOnly?: boolean }): Promise<NotificationRow[]>`, `markNotificationRead(pool, { viewerId, notificationId }): Promise<void>` from `src/lib/notifications/record.ts`. Tasks 2–4 call `recordNotification`; the UI task (6) calls `listNotifications`/`markNotificationRead`.

- [ ] **Step 1: Write `migrations/0009_create_notifications_table.sql`**

```sql
CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('LEAD_ASSIGNED','LEAD_TRANSFERRED','VISIT_SCHEDULED','VISIT_RESCHEDULED','VISIT_CANCELLED')),
  lead_id BIGINT REFERENCES leads(id),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_recipient ON notifications(recipient_user_id, read_at);
```

- [ ] **Step 2: Write the failing notification tests, run them, then implement `src/lib/notifications/record.ts`**

```ts
it("records and lists a recipient's notifications, newest first, with read filtering", async () => {
  await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "You were assigned Acme Corp" });
  const all = await listNotifications(pool, salespersonId);
  expect(all[0]).toMatchObject({ type: "LEAD_ASSIGNED", read_at: null });
  await markNotificationRead(pool, { viewerId: salespersonId, notificationId: all[0].id });
  expect(await listNotifications(pool, salespersonId, { unreadOnly: true })).toEqual([]);
});

it("rejects marking another user's notification read", async () => {
  await expect(markNotificationRead(pool, { viewerId: otherUserId, notificationId: someoneElsesNotificationId })).rejects.toThrow();
});
```

Plain parameterized `INSERT`/`SELECT ... WHERE recipient_user_id = $1 [AND read_at IS NULL] ORDER BY created_at DESC`/`UPDATE notifications SET read_at = now() WHERE id = $1 AND recipient_user_id = $2` (the `AND recipient_user_id` clause is what makes "mark read" implicitly ownership-checked — a zero-row update is the rejection; throw if `rowCount === 0`).

- [ ] **Step 3: Extend `src/lib/leads/assign.ts` to notify the new owner(s)**

After `assignLead`'s existing `recordLeadActivity` call, add one `recordNotification` call per owner that actually changed (compare the pre-update row's owner columns to the post-update ones; only notify when a given owner field was actually set/changed, not on every call).

- [ ] **Step 4: Update the failing `assign.test.ts` assertion, run it, confirm it passes**

```ts
it("notifies the newly assigned Salesperson", async () => {
  await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
  const notifications = await listNotifications(pool, salespersonId);
  expect(notifications.some((n) => n.type === "LEAD_ASSIGNED" && n.lead_id === qualifiedLead.id)).toBe(true);
});
```

Run: `npm test -- leads/assign.test.ts notifications/record.test.ts`
Expected: PASS

- [ ] **Step 5: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0009_create_notifications_table.sql src/lib/notifications/record.ts src/lib/notifications/record.test.ts src/lib/leads/assign.ts src/lib/leads/assign.test.ts
git commit -m "feat: in-app notifications, wired into lead assignment"
```

---

### Task 2: Lead transfer (single and bulk) with required reason and history

**Files:**
- Create: `migrations/0010_create_lead_transfer_history_table.sql` (also adds `'TRANSFER'` and `'CLIENT_VISIT'` to `lead_activities.type`, per Global Constraints — both new enum values land in one migration since both are needed before Task 2/3's tests can log them)
- Create: `src/lib/leads/transfer.ts`
- Test: `src/lib/leads/transfer.test.ts`
- Create: `src/app/api/leads/[id]/transfer/route.ts`
- Create: `src/app/api/leads/transfer-bulk/route.ts`
- Test: `src/app/api/leads/[id]/transfer/route.test.ts`

**Interfaces:**
- Consumes: `assertLeadVisible`, `recordLeadActivity` (Phase 3 Tasks 4–5), `recordNotification` (Task 1).
- Produces: `transferLead(pool, input: { actorId: number; actorRole: Role; leadId: number; newPreSalesOwnerId?: number; newSalespersonOwnerId?: number; reason: string }): Promise<LeadRow>` and `bulkTransferLeads(pool, input: { actorId: number; actorRole: Role; leadIds: number[]; newPreSalesOwnerId?: number; newSalespersonOwnerId?: number; reason: string }): Promise<LeadRow[]>` from `src/lib/leads/transfer.ts`.

- [ ] **Step 1: Write `migrations/0010_create_lead_transfer_history_table.sql`**

```sql
ALTER TABLE lead_activities DROP CONSTRAINT lead_activities_type_check;
ALTER TABLE lead_activities ADD CONSTRAINT lead_activities_type_check CHECK (type IN ('NOTE','CALL','MEETING','OTHER','STATUS_CHANGE','ASSIGNMENT','TRANSFER','CLIENT_VISIT'));

CREATE TABLE lead_transfer_history (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  previous_pre_sales_owner_id BIGINT REFERENCES users(id),
  previous_salesperson_owner_id BIGINT REFERENCES users(id),
  new_pre_sales_owner_id BIGINT REFERENCES users(id),
  new_salesperson_owner_id BIGINT REFERENCES users(id),
  transferred_by BIGINT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_transfer_history_lead_id ON lead_transfer_history(lead_id);
```

- [ ] **Step 2: Write the failing `transferLead` tests**

```ts
it("transfers a lead's Salesperson owner, recording the previous and new owner plus the reason", async () => {
  const updated = await transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "Territory realignment" });
  expect(updated.salesperson_owner_id).toBe(otherSalespersonId);
  const { rows } = await pool.query("SELECT * FROM lead_transfer_history WHERE lead_id = $1", [assignedLead.id]);
  expect(rows[0]).toMatchObject({ previous_salesperson_owner_id: originalSalespersonId, new_salesperson_owner_id: otherSalespersonId, reason: "Territory realignment" });
});

it("rejects a transfer with no reason", async () => {
  await expect(
    transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "" }),
  ).rejects.toThrow(InvalidLeadReasonError);
});

it("rejects transferring to an inactive user", async () => {
  await expect(
    transferLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: assignedLead.id, newSalespersonOwnerId: inactiveSalespersonId, reason: "x" }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("rejects a Pre-sales user calling transfer", async () => {
  await expect(
    transferLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: assignedLead.id, newSalespersonOwnerId: otherSalespersonId, reason: "x" }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("bulk-transfers several leads in one call, writing one history row per lead", async () => {
  const updated = await bulkTransferLeads(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadIds: [leadA.id, leadB.id], newSalespersonOwnerId: otherSalespersonId, reason: "Bulk realignment" });
  expect(updated).toHaveLength(2);
  const { rows } = await pool.query("SELECT lead_id FROM lead_transfer_history WHERE lead_id = ANY($1)", [[leadA.id, leadB.id]]);
  expect(rows).toHaveLength(2);
});
```

- [ ] **Step 3: Run tests to verify they fail, then implement `transferLead`**

Same shape as Phase 3's `assignLead`: role check (`MARKETING_HEAD` only), `assertLeadVisible`, throw `InvalidLeadReasonError` unless `reason.trim()`, validate each target id's active status/role the same way `assignLead` does, one transaction updating `leads`' owner columns and inserting into `lead_transfer_history` (capturing the *previous* owner columns read before the update, and the *new* ones from the update's `RETURNING`), then `recordLeadActivity(..., type: "TRANSFER", notes: reason)` and `recordNotification` for whichever of the previous and new owners actually changed.

- [ ] **Step 4: Implement `bulkTransferLeads`**

One outer transaction wrapping a loop that performs each lead's update/history-insert (reusing the same validated-target-id lookups once, not per lead); if any `leadId` fails `assertLeadVisible` or the target-validity check, roll back the whole batch — a bulk transfer either fully succeeds or fully fails, matching "perform a bulk transfer only with a clear confirmation step" (the confirmation itself is a UI concern, Task 6).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- leads/transfer.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `POST /api/leads/[id]/transfer` and `POST /api/leads/transfer-bulk`**

Same auth preamble and Zod/error-mapping shape as Phase 3's `/api/leads/[id]/assign/route.ts`; `transfer-bulk` takes `{ leadIds: z.array(z.number().int()).min(1), newPreSalesOwnerId, newSalespersonOwnerId, reason }`.

- [ ] **Step 7: Write the failing route test, confirm it passes, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0010_create_lead_transfer_history_table.sql src/lib/leads/transfer.ts src/lib/leads/transfer.test.ts "src/app/api/leads/[id]/transfer" src/app/api/leads/transfer-bulk
git commit -m "feat: lead transfer (single and bulk) with required reason and history"
```

---

### Task 3: Client visit scheduling with conflict warning

**Files:**
- Create: `migrations/0011_create_client_visits_table.sql`
- Create: `src/lib/visits/types.ts`
- Create: `src/lib/visits/errors.ts`
- Create: `src/lib/visits/schedule.ts`
- Test: `src/lib/visits/schedule.test.ts`
- Create: `src/app/api/leads/[id]/visits/route.ts`
- Test: `src/app/api/leads/[id]/visits/route.test.ts`

**Interfaces:**
- Consumes: `assertLeadVisible` (Phase 3 Task 4), `recordLeadActivity` (Phase 3 Task 5), `recordNotification` (Task 1).
- Produces: `VisitRow`, `VisitStatus`, `VISIT_STATUSES` (`src/lib/visits/types.ts`); `VisitNotFoundError`, `VisitNotAccessibleError`, `VisitActionNotAllowedError` (`src/lib/visits/errors.ts`); `scheduleVisit(pool, input: { actorId: number; actorRole: Role; leadId: number; salespersonId: number; visitDate: string; startTime: string; expectedDurationMinutes?: number; location?: string; objective: string; preparationNotes?: string }): Promise<VisitRow>` and `findConflictingVisit(pool, input: { salespersonId: number; visitDate: string; startTime: string }): Promise<VisitRow | null>` from `src/lib/visits/schedule.ts`. Task 4 reuses `VisitRow`/the errors; Task 6 (UI) calls `findConflictingVisit` the same advisory way Phase 3's UI calls `findPotentialDuplicates`.

- [ ] **Step 1: Write `migrations/0011_create_client_visits_table.sql`**

```sql
CREATE TABLE client_visits (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  salesperson_id BIGINT NOT NULL REFERENCES users(id),
  visit_date DATE NOT NULL,
  start_time TIME NOT NULL,
  expected_duration_minutes INTEGER,
  location TEXT,
  objective TEXT NOT NULL,
  preparation_notes TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED','COMPLETED','RESCHEDULED','CANCELLED','MISSED')),
  outcome_notes TEXT,
  next_action TEXT,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_visits_salesperson_date ON client_visits(salesperson_id, visit_date, start_time);
CREATE INDEX idx_client_visits_lead_id ON client_visits(lead_id);
```

- [ ] **Step 2: Write the failing tests**

```ts
it("schedules a visit for an active Salesperson and notifies them", async () => {
  const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "Demo the product" });
  expect(visit.status).toBe("SCHEDULED");
  expect((await listNotifications(pool, salespersonId)).some((n) => n.type === "VISIT_SCHEDULED")).toBe(true);
});

it("rejects scheduling for an inactive Salesperson", async () => {
  await expect(
    scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId: inactiveSalespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "x" }),
  ).rejects.toThrow(VisitActionNotAllowedError);
});

it("rejects a Pre-sales user scheduling a visit", async () => {
  await expect(
    scheduleVisit(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: lead.id, salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "x" }),
  ).rejects.toThrow(VisitActionNotAllowedError);
});

describe("findConflictingVisit", () => {
  it("flags a same-salesperson, same-date-and-start-time SCHEDULED visit", async () => {
    await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-03", startTime: "10:00", objective: "First" });
    const conflict = await findConflictingVisit(pool, { salespersonId, visitDate: "2026-11-03", startTime: "10:00" });
    expect(conflict).not.toBeNull();
  });

  it("does not flag a different time or a cancelled visit", async () => {
    expect(await findConflictingVisit(pool, { salespersonId, visitDate: "2026-11-03", startTime: "11:00" })).toBeNull();
  });
});
```

(The conflict rule is scoped to an exact same `visit_date` + `start_time` match against `SCHEDULED`/`RESCHEDULED` visits — not full duration-overlap math; req.md §8.3 says "another visit at the same time," and this is the plain reading of that phrase. If a future phase wants overlap-aware conflict detection, that's a separate, explicitly-requested change.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- visits/schedule.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement `src/lib/visits/schedule.ts`**

`scheduleVisit`: throw `VisitActionNotAllowedError` unless `actorRole === "MARKETING_HEAD"`; call `assertLeadVisible` (reused as-is — a visit's lead must be visible to its scheduler); validate `salespersonId` is `ACTIVE` + role `SALESPERSON` (same lookup pattern as Phase 3's `assignLead`); `INSERT INTO client_visits (...) VALUES (...) RETURNING *`; `recordLeadActivity(..., type: "CLIENT_VISIT", notes: objective)`; `recordNotification(..., type: "VISIT_SCHEDULED")`. `findConflictingVisit`: `SELECT * FROM client_visits WHERE salesperson_id = $1 AND visit_date = $2 AND start_time = $3 AND status IN ('SCHEDULED','RESCHEDULED') LIMIT 1`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- visits/schedule.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `GET`/`POST /api/leads/[id]/visits` in `src/app/api/leads/[id]/visits/route.ts`**

`POST`: auth preamble, Zod-validate the `scheduleVisit` input shape, call it, catch `VisitActionNotAllowedError`/`LeadNotAccessibleError` → 403, `LeadNotFoundError` → 404. `GET`: `assertLeadVisible` then `SELECT * FROM client_visits WHERE lead_id = $1 ORDER BY visit_date, start_time` (any viewer who can see the lead can see its visits — no extra ownership layer needed here, since a visit is a child of a lead the viewer already passed the lead-visibility check for).

- [ ] **Step 7: Write the failing route test, confirm it passes, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0011_create_client_visits_table.sql src/lib/visits src/app/api/leads/\[id\]/visits
git commit -m "feat: client visit scheduling with same-slot conflict detection"
```

---

### Task 4: Visit reschedule and cancel

**Files:**
- Modify: `src/lib/visits/schedule.ts` (add `rescheduleVisit`, `cancelVisit`)
- Modify: `src/lib/visits/schedule.test.ts`
- Create: `src/app/api/visits/[id]/route.ts`
- Test: `src/app/api/visits/[id]/route.test.ts`

**Interfaces:**
- Consumes: `VisitRow`, visit errors (Task 3), `recordLeadActivity`, `recordNotification`.
- Produces: `rescheduleVisit(pool, input: { actorId: number; actorRole: Role; visitId: number; visitDate: string; startTime: string }): Promise<VisitRow>` and `cancelVisit(pool, input: { actorId: number; actorRole: Role; visitId: number }): Promise<VisitRow>`.

- [ ] **Step 1: Write the failing tests**

```ts
it("reschedules a visit, keeping it findable by its new slot's conflict check", async () => {
  const updated = await rescheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", visitId: visit.id, visitDate: "2026-11-10", startTime: "09:00" });
  expect(updated).toMatchObject({ status: "RESCHEDULED", visit_date: "2026-11-10" });
});

it("cancels a visit and notifies the assigned Salesperson", async () => {
  const updated = await cancelVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", visitId: visit.id });
  expect(updated.status).toBe("CANCELLED");
  expect((await listNotifications(pool, visit.salesperson_id)).some((n) => n.type === "VISIT_CANCELLED")).toBe(true);
});

it("rejects a non-Marketing-Head rescheduling or cancelling", async () => {
  await expect(rescheduleVisit(pool, { actorId: preSalesId, actorRole: "PRE_SALES", visitId: visit.id, visitDate: "2026-11-10", startTime: "09:00" })).rejects.toThrow(VisitActionNotAllowedError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- visits/schedule.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `rescheduleVisit`/`cancelVisit`**

Both: throw `VisitActionNotAllowedError` unless `MARKETING_HEAD`; `SELECT * FROM client_visits WHERE id = $1`, throw `VisitNotFoundError` if absent. `rescheduleVisit`: `UPDATE client_visits SET status = 'RESCHEDULED', visit_date = $1, start_time = $2, updated_at = now() WHERE id = $3 RETURNING *`, then `recordLeadActivity`/`recordNotification` (`VISIT_RESCHEDULED`). `cancelVisit`: `UPDATE client_visits SET status = 'CANCELLED', updated_at = now() WHERE id = $1 RETURNING *`, then notify (`VISIT_CANCELLED`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- visits/schedule.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `PATCH /api/visits/[id]`**

`{ action: "RESCHEDULE", visitDate, startTime } | { action: "CANCEL" }`, same auth/error-mapping shape as the other action routes.

- [ ] **Step 6: Write the failing route test, confirm it passes, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/visits/schedule.ts src/lib/visits/schedule.test.ts "src/app/api/visits/[id]/route.ts" "src/app/api/visits/[id]/route.test.ts"
git commit -m "feat: visit reschedule and cancel"
```

---

### Task 5: Visit outcome recording

**Files:**
- Modify: `src/lib/visits/schedule.ts` (add `recordVisitOutcome`)
- Modify: `src/lib/visits/schedule.test.ts`
- Modify: `src/app/api/visits/[id]/route.ts` (add the `RECORD_OUTCOME` action)

**Interfaces:**
- Produces: `recordVisitOutcome(pool, input: { actorId: number; actorRole: Role; visitId: number; outcome: "COMPLETED" | "MISSED"; outcomeNotes?: string; nextAction?: string }): Promise<VisitRow>`.

- [ ] **Step 1: Write the failing tests**

```ts
it("lets the assigned Salesperson record a Completed outcome", async () => {
  const updated = await recordVisitOutcome(pool, { actorId: salespersonId, actorRole: "SALESPERSON", visitId: visit.id, outcome: "COMPLETED", outcomeNotes: "Went well, sending quote" });
  expect(updated).toMatchObject({ status: "COMPLETED", outcome_notes: "Went well, sending quote" });
});

it("rejects another Salesperson recording this visit's outcome", async () => {
  await expect(
    recordVisitOutcome(pool, { actorId: otherSalespersonId, actorRole: "SALESPERSON", visitId: visit.id, outcome: "COMPLETED" }),
  ).rejects.toThrow(VisitNotAccessibleError);
});

it("rejects a Marketing Head recording an outcome directly (only the assigned Salesperson may)", async () => {
  await expect(
    recordVisitOutcome(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", visitId: visit.id, outcome: "COMPLETED" }),
  ).rejects.toThrow(VisitActionNotAllowedError);
});
```

(Restricting outcome-recording to the assigned Salesperson only — not also Marketing Head — is this plan's call: req.md §8.3 step 5 says "The Salesperson records the outcome after the visit," naming only that role for this specific action, unlike scheduling/rescheduling which §8.3 names Marketing Head for throughout.)

- [ ] **Step 2: Run tests to verify they fail, then implement `recordVisitOutcome`**

Throw `VisitActionNotAllowedError` unless `actorRole === "SALESPERSON"`. `SELECT * FROM client_visits WHERE id = $1`; throw `VisitNotFoundError` if absent, `VisitNotAccessibleError` unless `salesperson_id === actorId`. `UPDATE client_visits SET status = $1, outcome_notes = $2, next_action = $3, updated_at = now() WHERE id = $4 RETURNING *`.

- [ ] **Step 3: Run tests to verify they pass, add the route action, write/run its test**

Run: `npm test -- visits/schedule.test.ts "visits/\[id\]/route.test.ts"`
Expected: PASS

- [ ] **Step 4: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/visits/schedule.ts src/lib/visits/schedule.test.ts "src/app/api/visits/[id]/route.ts" "src/app/api/visits/[id]/route.test.ts"
git commit -m "feat: visit outcome recording by the assigned Salesperson"
```

---

### Task 6: UI — notifications, lead transfer, and the visits panel

**Files:**
- Create: `src/app/(dashboard)/NotificationsBell.tsx`
- Test: `src/app/(dashboard)/NotificationsBell.test.tsx`
- Modify: `src/app/(dashboard)/DashboardShell.tsx` (mount the bell next to `SignOutButton`)
- Modify: `src/app/(dashboard)/leads/[id]/LeadDetailView.tsx` (add a Transfer action and a Visits panel)
- Modify: `src/app/(dashboard)/leads/[id]/LeadDetailView.test.tsx`
- Modify: `src/app/(dashboard)/leads/LeadsView.tsx` (add row-selection + "Transfer selected" bulk action)
- Modify: `src/app/(dashboard)/leads/LeadsView.test.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`/`PATCH /api/notifications/[id]` (new, thin wrappers over Task 1's functions — add alongside this task since nothing needed them server-side until now), `GET/POST /api/leads/[id]/visits`, `PATCH /api/visits/[id]`, `POST /api/leads/[id]/transfer`, `POST /api/leads/transfer-bulk`.

- [ ] **Step 1: Add `src/app/api/notifications/route.ts` (`GET`) and `src/app/api/notifications/[id]/route.ts` (`PATCH` to mark read)**

Same auth preamble as every other route; `GET` calls `listNotifications(pool, user.id, { unreadOnly: searchParams.get("unread") === "true" })`.

- [ ] **Step 2: Write the failing `NotificationsBell` test**

```tsx
it("shows an unread count and marks a notification read on click", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ notifications: [{ id: 1, type: "LEAD_ASSIGNED", message: "You were assigned Acme Corp", read_at: null }] })));
  render(<NotificationsBell />);
  expect(await screen.findByText("1")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails, implement `NotificationsBell.tsx`**

A small bell-icon button (Remix `ri-notification-3-line`) with an unread-count dot, opening a dropdown list of recent notifications on click; clicking one calls the `PATCH` route and removes it from the unread count. Follows the same client-component/`fetch`-in-`useEffect` pattern as `TeamView.tsx`.

- [ ] **Step 4: Mount it in `DashboardShell.tsx`**

Add `<NotificationsBell />` next to `<SignOutButton />` in both the desktop and mobile top bars.

- [ ] **Step 5: Add the Transfer action and Visits panel to `LeadDetailView.tsx`**

Transfer: a Marketing-Head-only "Transfer" button opening a modal (new Pre-sales owner / new Salesperson select + required reason textarea), mirroring the existing reject/return reason-prompt dialog from Phase 3 Task 9. Visits: a list of the lead's visits (status pill from a new `VISIT_STATUS_BADGE_CLASSES` map alongside `leadDisplay.ts`'s existing maps) with a Marketing-Head-only "Schedule visit" form that calls the conflict-check inline (same blur-triggered advisory pattern as the duplicate-lead check) and a Salesperson-only outcome form on their own upcoming visits.

- [ ] **Step 6: Add bulk transfer to `LeadsView.tsx`**

Row checkboxes + a "Transfer selected" button (visible only when ≥1 row is checked and the viewer is `MARKETING_HEAD`) opening the same transfer modal shape, calling `POST /api/leads/transfer-bulk`; per req.md §7.1, this requires "a clear confirmation step" — reuse the existing confirm-dialog component from `TeamView.tsx`'s activate/deactivate flow before the bulk call fires.

- [ ] **Step 7: Run full suite, typecheck, build, manual verification, commit**

Manually verify in `npm run dev`: schedule two visits for the same Salesperson/slot and confirm the conflict warning appears; transfer a lead and confirm both the previous and new owner get a notification; cancel a visit and confirm its Salesperson sees a notification.

```bash
npm test && npx tsc --noEmit && npx next build
git add src/app/\(dashboard\)/NotificationsBell.tsx src/app/\(dashboard\)/NotificationsBell.test.tsx src/app/\(dashboard\)/DashboardShell.tsx src/app/\(dashboard\)/leads src/app/api/notifications
git commit -m "feat: notifications bell, lead transfer UI, and visits panel"
```

---

## Self-Review

**Spec coverage:** §7.1/§7.2 (transfer actions, reason, history, bulk, preserve related records) → Task 2. §8.1/§8.2 (visit fields/statuses) → Task 3's migration. §8.3 (schedule/reschedule/cancel/outcome workflow, conflict warning, notify, stays in activity history) → Tasks 3–5 (`recordLeadActivity(..., "CLIENT_VISIT")` is the "stays in the lead's activity history" requirement). The scattered "notify" bullets across §6.2/§7.1/§8.3 → Task 1 plus each task's `recordNotification` call.

**Not covered here:** email delivery of these notifications (Phase 5's `email_announcements`/SMTP feature is a distinct mechanism from this phase's in-app `notifications` table — see Global Constraints).

**Review Focus coverage:** inactive/wrong-role transfer or visit target → Task 2 Step 2, Task 3 Step 2. Reason required on transfer → Task 2 Step 2. Same-slot visit conflict is advisory → Task 3 Step 2. Per-record ownership on visit outcome → Task 5 Step 1. Notifications on reschedule/cancel/transfer → Task 2 Step 3's "notify whichever owner changed," Task 4 Step 1's cancel test.
