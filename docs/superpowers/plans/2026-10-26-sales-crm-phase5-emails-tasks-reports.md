# Sales CRM — Phase 5: Email Announcements, Tasks, and Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Marketing Head or Super Admin compose and send an email announcement to one user, a selected group, or every active Pre-sales/Salesperson, with per-recipient delivery tracking and bounded retries; give every role a personal task/follow-up list; and replace the placeholder dashboard welcome card with the role-specific widgets req.md §11 actually asks for.

**Architecture:** Three new tables (`email_announcements`, `email_recipients`, `email_logs`) hold composition, recipient-group resolution, and per-recipient delivery state as three separate concerns, mirroring req.md §12's own table split. A thin `sendEmail()` wrapper around one new dependency (`nodemailer`) is the only place that touches SMTP. `tasks` is a standalone table (a task may optionally reference a lead, but tasks are a user's own to-do list, not a lead sub-resource, so it gets its own top-level routes rather than nesting under `/api/leads/[id]`). Dashboard widgets are read-only aggregation queries over tables already built in Phases 1–4 — no new tables, just four new `src/lib/dashboard/*.ts` modules, one per role.

**Tech Stack:** Same as Phases 1–4 — Next.js App Router + TypeScript, `pg` raw SQL (no ORM), Zod, Tailwind CSS, Remix Icons, Vitest. **New dependency: `nodemailer` + `@types/nodemailer`** — this is the one place in the whole project that needs real SMTP, and hand-rolling that protocol is exactly the case ponytail's own dependency rule carves out ("an installed dependency? use it... never add one for a few lines" — this is not a few lines). Flag this to the user before running `npm install`.

**Spec:** `req.md` §9 (Email and Team Announcements), §10 (Activities, Tasks, and Follow-ups — the Tasks half only; Activities already shipped in Phase 3), §11 (Dashboards and Reports).

**Depends on:** Phase 3's `leads`/`lead_activities`/`listLeads`; Phase 4's `client_visits`/`lead_transfer_history`; Phase 2's `users`.

## Global Constraints

- No ORM: raw `pg` only, parameterized queries (req.md §12).
- Migrations continue after Phase 4's `0009`–`0011` — this phase uses `0012`–`0013` (`email_*` tables in one migration, `tasks` in another).
- SMTP credentials live only in server-side environment variables (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`), read only inside `src/lib/email/sendEmail.ts`, never passed to a Client Component or exposed via `NEXT_PUBLIC_*` (req.md §9.3, §13).
- Sending is restricted to `MARKETING_HEAD` and `SUPER_ADMIN` server-side, not only hidden in the UI (req.md §9.3).
- No untrusted HTML execution: the message body is rendered as plain text (wrapped in `<pre>`-equivalent escaping) in both the sent email and any in-app preview — this phase does not add a rich-text/HTML editor, since req.md §9.1 only requires "plain-text or safely rendered HTML," and plain text is the smaller, safer default until someone asks for rich formatting (req.md §9.1).
- There is no background job scheduler or queue in this app. Sending happens inline, synchronously, when an announcement is created, one attempt per recipient; `email_logs.status` starts `'PENDING'` and becomes `'SENT'`/`'FAILED'` from that one attempt. Bounded retry (req.md §9.3's "Retry temporary failures with bounded retry attempts") is a manual "Retry failed" action a Marketing Head clicks — it is **not** an automatic background retry loop, because building a cron/queue is a separate infrastructure decision this plan does not make unilaterally. If automatic retry turns out to matter, that's a follow-up request, not an assumption to build in now.
- A retry only ever re-attempts rows still `'FAILED'`; it must not re-send a row already `'SENT'` — "avoid duplicate emails when jobs are retried" (req.md §9.3).
- Role-scoped dashboard data reuses each module's own existing visibility rule (`listLeads` for lead counts, `listUsers`' `VISIBLE_ROLES` shape for team summaries) rather than re-deriving a new one — "Reports must respect role-based access" (req.md §11).
- UI reuses the established colored-pill/card conventions (req.md §14).

## Review Focus

- A `PRE_SALES`/`SALESPERSON`/`HR` user calling the send-announcement route directly must get 403 regardless of what the UI shows (req.md §9.3).
- Sending to "all active Pre-sales" (or Salespeople) must resolve to exactly the users with that role and `status = 'ACTIVE'` at send time — not every user ever created with that role, and not a stale list if someone was deactivated between composing and a later retry (req.md §9's recipient-group bullets).
- A retry must change only `'FAILED'` rows to `'SENT'`/`'FAILED'` again, and must leave already-`'SENT'` rows untouched — the most likely way to accidentally double-send (req.md §9.3).
- A task's due date determines whether it's "overdue," "due today," or "upcoming" using the server's current time at query time, not the task's creation time — a task created yesterday with today's due date is "due today," not "overdue" (req.md §10).
- Each dashboard's query must stop at its own role's visibility boundary — e.g. a Pre-sales dashboard's "recently updated leads" must be the same ownership-scoped set `listLeads` already returns for that Pre-sales user, not a company-wide query that happens to get filtered client-side (req.md §11, last line).

---

### Task 1: Email tables and the SMTP send wrapper

**Files:**
- Create: `migrations/0012_create_email_tables.sql`
- Create: `src/lib/email/types.ts`
- Create: `src/lib/email/sendEmail.ts`
- Test: `src/lib/email/sendEmail.test.ts`

**Interfaces:**
- Consumes: nothing new (plus the new `nodemailer` dependency).
- Produces: `EmailAnnouncementRow`, `EmailRecipientRow`, `EmailLogRow`, `EmailLogStatus`, `EMAIL_LOG_STATUSES` (`src/lib/email/types.ts`); `sendEmail(input: { to: string; subject: string; body: string }): Promise<{ ok: true } | { ok: false; error: string }>` from `src/lib/email/sendEmail.ts` (a thin, mockable wrapper — every later test mocks this, never real SMTP).

- [ ] **Step 1: Add the dependency**

```bash
npm install nodemailer
npm install -D @types/nodemailer
```

- [ ] **Step 2: Write `migrations/0012_create_email_tables.sql`**

```sql
CREATE TABLE email_announcements (
  id BIGSERIAL PRIMARY KEY,
  sender_user_id BIGINT NOT NULL REFERENCES users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_recipients (
  id BIGSERIAL PRIMARY KEY,
  announcement_id BIGINT NOT NULL REFERENCES email_announcements(id),
  recipient_user_id BIGINT NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_email_recipients_announcement ON email_recipients(announcement_id);

CREATE TABLE email_logs (
  id BIGSERIAL PRIMARY KEY,
  recipient_id BIGINT NOT NULL REFERENCES email_recipients(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','RETRYING')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_logs_recipient ON email_logs(recipient_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
```

- [ ] **Step 3: Write `src/lib/email/types.ts`**

Plain row types mirroring the migration's columns, plus `export const EMAIL_LOG_STATUSES = ["PENDING", "SENT", "FAILED", "RETRYING"] as const;`.

- [ ] **Step 4: Write the failing `sendEmail` test**

```ts
// src/lib/email/sendEmail.test.ts
import { describe, it, expect, vi } from "vitest";
import nodemailer from "nodemailer";
import { sendEmail } from "./sendEmail";

vi.mock("nodemailer");

it("returns ok:true on a successful SMTP send", async () => {
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) } as never);
  expect(await sendEmail({ to: "a@example.com", subject: "Hi", body: "Hello" })).toEqual({ ok: true });
});

it("returns ok:false with the error message on an SMTP failure", async () => {
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error("connection refused")) } as never);
  expect(await sendEmail({ to: "a@example.com", subject: "Hi", body: "Hello" })).toEqual({ ok: false, error: "connection refused" });
});
```

- [ ] **Step 5: Run test to verify it fails, then implement `src/lib/email/sendEmail.ts`**

One module-level `nodemailer.createTransport({ host, port, auth: { user, pass } })` built from `process.env.SMTP_*`, read lazily (inside the function, not at import time, so tests that mock the module don't need real env vars). `sendEmail` calls `transport.sendMail({ from: process.env.SMTP_FROM, to, subject, text: body })`, catches and returns `{ ok: false, error: error.message }` on throw, `{ ok: true }` otherwise.

- [ ] **Step 6: Run test to verify it passes, run full suite + typecheck, commit**

```bash
npm test -- email/sendEmail.test.ts && npx tsc --noEmit
git add package.json package-lock.json migrations/0012_create_email_tables.sql src/lib/email/types.ts src/lib/email/sendEmail.ts src/lib/email/sendEmail.test.ts
git commit -m "feat: email tables and SMTP send wrapper (adds nodemailer)"
```

---

### Task 2: Compose and send an announcement

**Files:**
- Create: `src/lib/email/announce.ts`
- Test: `src/lib/email/announce.test.ts`
- Create: `src/app/api/email-announcements/route.ts`
- Test: `src/app/api/email-announcements/route.test.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 1), `listUsers`/`VISIBLE_ROLES`-equivalent — actually a new, simpler query (see Step 3) since recipient-group resolution needs "every `ACTIVE` user of role X," not a viewer-scoped visibility set.
- Produces: `createAnnouncement(pool, input: { senderId: number; senderRole: Role; subject: string; body: string; recipientGroup: { type: "USER"; userId: number } | { type: "USERS"; userIds: number[] } | { type: "ALL_PRE_SALES" } | { type: "ALL_SALESPEOPLE" } }): Promise<EmailAnnouncementRow>` from `src/lib/email/announce.ts`. Task 5 (UI) calls the route.

- [ ] **Step 1: Write the failing tests**

```ts
it("rejects a Pre-sales user composing an announcement", async () => {
  await expect(
    createAnnouncement(pool, { senderId: preSalesId, senderRole: "PRE_SALES", subject: "Hi", body: "Hi", recipientGroup: { type: "ALL_SALESPEOPLE" } }),
  ).rejects.toThrow(EmailActionNotAllowedError);
});

it("resolves ALL_PRE_SALES to only active Pre-sales users, excluding an inactive one", async () => {
  const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Update", body: "Body", recipientGroup: { type: "ALL_PRE_SALES" } });
  const { rows } = await pool.query("SELECT recipient_user_id FROM email_recipients WHERE announcement_id = $1", [announcement.id]);
  const recipientIds = rows.map((r) => r.recipient_user_id);
  expect(recipientIds).toContain(activePreSalesId);
  expect(recipientIds).not.toContain(inactivePreSalesId);
});

it("creates one email_logs row per recipient and sends via sendEmail", async () => {
  const sendEmailMock = vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
  const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
  expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ subject: "Hi" }));
  const { rows } = await pool.query(
    `SELECT el.status FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`, [announcement.id],
  );
  expect(rows[0].status).toBe("SENT");
});

it("marks a recipient FAILED (not thrown) when sendEmail fails, without failing the others", async () => {
  vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
  const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
  const { rows } = await pool.query(
    `SELECT el.status, el.last_error FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`, [announcement.id],
  );
  expect(rows[0]).toMatchObject({ status: "FAILED", last_error: "bounced" });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- email/announce.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `createAnnouncement` in `src/lib/email/announce.ts`**

Throw `EmailActionNotAllowedError` (new, in `src/lib/email/errors.ts`) unless `senderRole` is `MARKETING_HEAD`/`SUPER_ADMIN`. Resolve `recipientGroup` to a `number[]` of user ids: `USER`/`USERS` pass through as-is; `ALL_PRE_SALES`/`ALL_SALESPEOPLE` run `SELECT id FROM users WHERE role = $1 AND status = 'ACTIVE'`. `INSERT INTO email_announcements (...) RETURNING *`, then for each recipient id: `INSERT INTO email_recipients (...) RETURNING id`, `INSERT INTO email_logs (recipient_id, status, attempt_count) VALUES ($1, 'PENDING', 0) RETURNING id`, call `sendEmail`, then `UPDATE email_logs SET status = $1, attempt_count = attempt_count + 1, last_error = $2, sent_at = $3, updated_at = now() WHERE id = $4` — `'SENT'`/`now()` on success, `'FAILED'`/the error message on failure. One recipient's failure must not throw or abort the loop over the rest.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- email/announce.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `POST`/`GET /api/email-announcements`**

`POST`: auth preamble, Zod-validate `subject`/`body`/`recipientGroup` (a discriminated union matching the type above), call `createAnnouncement`, catch `EmailActionNotAllowedError` → 403, return `201` with the announcement plus its per-recipient statuses (one join query). `GET`: list past announcements the caller sent (or, for `SUPER_ADMIN`, all of them — req.md §9 doesn't name Super Admin as a sender, only as the dashboard's "email delivery failures" viewer in §11.1, so Super Admin's `GET` is read-only history, and its `POST` capability in Global Constraints is this plan's deliberate reading of §9.3's "Restrict announcement sending to Marketing Heads and Super Admin").

- [ ] **Step 6: Write the failing route test, confirm it passes, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/email/announce.ts src/lib/email/announce.test.ts src/lib/email/errors.ts src/app/api/email-announcements
git commit -m "feat: compose and send an email announcement to a resolved recipient group"
```

---

### Task 3: Manual retry for failed recipients

**Files:**
- Modify: `src/lib/email/announce.ts` (add `retryFailedRecipients`)
- Modify: `src/lib/email/announce.test.ts`
- Create: `src/app/api/email-announcements/[id]/retry/route.ts`
- Test: `src/app/api/email-announcements/[id]/retry/route.test.ts`

**Interfaces:**
- Produces: `retryFailedRecipients(pool, input: { actorId: number; actorRole: Role; announcementId: number; maxAttempts?: number }): Promise<{ retried: number; stillFailed: number }>` (`maxAttempts` defaults to `3`, per req.md §9.3's "bounded retry attempts").

- [ ] **Step 1: Write the failing tests**

```ts
it("retries only FAILED recipients, leaving SENT ones untouched", async () => {
  vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
  const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcementWithOneFailure.id });
  expect(result).toEqual({ retried: 1, stillFailed: 0 });
  const { rows } = await pool.query(
    `SELECT status, attempt_count FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1 ORDER BY el.id`, [announcementWithOneFailure.id],
  );
  expect(rows.find((r) => r.status === "SENT").attempt_count).toBeGreaterThanOrEqual(1);
});

it("does not retry a recipient that already hit maxAttempts", async () => {
  const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: exhaustedAnnouncement.id, maxAttempts: 1 });
  expect(result.retried).toBe(0);
});

it("rejects a non-Marketing-Head/Super-Admin retrying", async () => {
  await expect(retryFailedRecipients(pool, { actorId: preSalesId, actorRole: "PRE_SALES", announcementId: announcementWithOneFailure.id })).rejects.toThrow(EmailActionNotAllowedError);
});
```

- [ ] **Step 2: Run tests to verify they fail, then implement `retryFailedRecipients`**

Role check as Task 2. `SELECT el.id, er.recipient_user_id FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1 AND el.status = 'FAILED' AND el.attempt_count < $2`. For each: set status `'RETRYING'`, call `sendEmail`, then the same success/failure `UPDATE` as Task 2's send loop. Return the count that ended `'SENT'` vs. still `'FAILED'`.

- [ ] **Step 3: Run tests to verify they pass**

Run: `npm test -- email/announce.test.ts`
Expected: PASS

- [ ] **Step 4: Implement `POST /api/email-announcements/[id]/retry`, write/run its test, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/email/announce.ts src/lib/email/announce.test.ts "src/app/api/email-announcements/[id]/retry"
git commit -m "feat: bounded manual retry for failed announcement recipients"
```

---

### Task 4: Tasks (follow-ups)

**Files:**
- Create: `migrations/0013_create_tasks_table.sql`
- Create: `src/lib/tasks/types.ts`
- Create: `src/lib/tasks/errors.ts`
- Create: `src/lib/tasks/crud.ts`
- Test: `src/lib/tasks/crud.test.ts`
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`
- Test: `src/app/api/tasks/route.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TaskRow`, `TaskStatus`, `TASK_STATUSES`, `TaskPriority` (reuses Phase 3's `LEAD_PRIORITIES` shape, `src/lib/tasks/types.ts`); `createTask`, `updateTask`, `listTasks(pool, viewer: { id: number; role: Role }, filters: { status?: TaskStatus; dueWithin?: "TODAY" | "OVERDUE" | "UPCOMING" }): Promise<TaskRow[]>` from `src/lib/tasks/crud.ts`.

- [ ] **Step 1: Write `migrations/0013_create_tasks_table.sql`**

```sql
CREATE TABLE tasks (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id),
  assigned_user_id BIGINT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_tasks_assigned_user_due ON tasks(assigned_user_id, due_at);
```

- [ ] **Step 2: Write the failing tests**

```ts
it("creates a task assigned to a user, and lets only that user or their creator see it in listTasks", async () => {
  const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Follow up", dueAt: new Date("2026-11-05T10:00:00Z") });
  expect(await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, {})).toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id })]));
  expect(await listTasks(pool, { id: otherSalespersonId, role: "SALESPERSON" }, {})).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: task.id })]));
});

it("buckets tasks into OVERDUE/TODAY/UPCOMING by due_at against the current time", async () => {
  const overdue = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Past due", dueAt: new Date(Date.now() - 86_400_000) });
  const upcoming = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "Later", dueAt: new Date(Date.now() + 7 * 86_400_000) });
  const overdueList = await listTasks(pool, { id: salespersonId, role: "SALESPERSON" }, { dueWithin: "OVERDUE" });
  expect(overdueList.some((t) => t.id === overdue.id)).toBe(true);
  expect(overdueList.some((t) => t.id === upcoming.id)).toBe(false);
});

it("lets the assigned user update status, setting completed_at when COMPLETED", async () => {
  const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
  const updated = await updateTask(pool, { actorId: salespersonId, taskId: task.id, status: "COMPLETED" });
  expect(updated.completed_at).not.toBeNull();
});

it("rejects a user updating someone else's task", async () => {
  const task = await createTask(pool, { creatorId: mhId, assignedUserId: salespersonId, title: "X", dueAt: new Date() });
  await expect(updateTask(pool, { actorId: otherSalespersonId, taskId: task.id, status: "COMPLETED" })).rejects.toThrow(TaskNotAccessibleError);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tasks/crud.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement `src/lib/tasks/crud.ts`**

`createTask`: any authenticated role may create a task for themselves or, per req.md §3.3's Marketing Head permissions (team-wide oversight) and §11's role-scoped dashboards implying Marketing Heads assign follow-ups, for anyone — this plan does not add a separate role gate on *who* a task can be assigned to, since req.md names no restriction here (unlike leads/visits, which are explicit). Plain parameterized `INSERT ... RETURNING *`. `listTasks`: `assigned_user_id = $1` for everyone except `SUPER_ADMIN`/`MARKETING_HEAD`, who may omit that filter to see the team's tasks (mirrors the lead-visibility split, but simpler — no "or creator" clause, since a task's creator isn't necessarily entitled to see every task they ever assigned to someone else in this phase); apply `due_at < now()` / `due_at::date = current_date` / `due_at > now() AND due_at::date != current_date` for `dueWithin`. `updateTask`: `SELECT assigned_user_id FROM tasks WHERE id = $1`, throw `TaskNotFoundError`/`TaskNotAccessibleError` unless it's absent/not the actor's; `UPDATE tasks SET status = $1, completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE completed_at END, ... WHERE id = $2 RETURNING *`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tasks/crud.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `GET`/`POST /api/tasks` and `PATCH /api/tasks/[id]`, write/run their tests, run full suite + typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0013_create_tasks_table.sql src/lib/tasks src/app/api/tasks
git commit -m "feat: tasks and follow-ups"
```

---

### Task 5: Role-specific dashboard data

**Files:**
- Create: `src/lib/dashboard/superAdmin.ts`
- Create: `src/lib/dashboard/marketingHead.ts`
- Create: `src/lib/dashboard/preSales.ts`
- Create: `src/lib/dashboard/salesperson.ts`
- Test: `src/lib/dashboard/superAdmin.test.ts` (one representative test file; the other three follow the identical pattern per role)
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `listLeads` (Phase 3), `listTasks` (Task 4), `client_visits`/`lead_transfer_history` (Phase 4), `email_logs` (Task 1).
- Produces: `getSuperAdminDashboard(pool): Promise<{...}>`, `getMarketingHeadDashboard(pool): Promise<{...}>`, `getPreSalesDashboard(pool, userId: number): Promise<{...}>`, `getSalespersonDashboard(pool, userId: number): Promise<{...}>` — one function per role, each returning exactly the fields its req.md §11 subsection lists (no shared generic shape forced across roles, since the four widget sets genuinely differ).

- [ ] **Step 1: Write the failing Super Admin dashboard test**

```ts
// src/lib/dashboard/superAdmin.test.ts
it("returns active-user counts by role, lead counts by status, and email failure count", async () => {
  const dashboard = await getSuperAdminDashboard(pool);
  expect(dashboard.activeUsersByRole).toMatchObject({ SUPER_ADMIN: expect.any(Number), HR: expect.any(Number) });
  expect(dashboard.leadsByStatus).toMatchObject({ PENDING_REVIEW: expect.any(Number) });
  expect(dashboard.emailDeliveryFailures).toEqual(expect.any(Number));
});
```

- [ ] **Step 2: Run test to verify it fails, implement `getSuperAdminDashboard`**

Each field is one small aggregate query: `SELECT role, count(*) FROM users WHERE status = 'ACTIVE' GROUP BY role`; `SELECT status, count(*) FROM leads GROUP BY status`; `SELECT count(*) FROM email_logs WHERE status = 'FAILED'`; `SELECT count(*) FROM lead_assignments WHERE changed_at > now() - interval '30 days'` plus the same for `lead_transfer_history` (assignment/transfer activity); `SELECT count(*) FILTER (WHERE status = 'SCHEDULED' AND visit_date >= current_date), count(*) FILTER (WHERE status = 'COMPLETED') FROM client_visits` (upcoming/completed visits); a recent `audit_logs` slice (`ORDER BY created_at DESC LIMIT 20`) for the audit-log overview. Map each raw row-set into the plain object the test expects.

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test -- dashboard/superAdmin.test.ts`
Expected: PASS

- [ ] **Step 4: Implement the other three dashboard modules the same way**

`getMarketingHeadDashboard`: total/pending-review lead counts, `listLeads`-style breakdowns by status/source/priority, qualified/converted counts, leads grouped by owner, upcoming/missed visits, overdue tasks (`listTasks` with no `assigned_user_id` filter + `dueWithin: "OVERDUE"`), transfer history count, a simple conversion-rate number (`CONVERTED` count / total). `getPreSalesDashboard(pool, userId)`: reuses `listLeads(pool, { id: userId, role: "PRE_SALES" }, {...})` for "leads created by the user" and "awaiting review/more info," `listTasks(pool, { id: userId, role: "PRE_SALES" }, { dueWithin: "TODAY" })` for follow-ups due today, plus "recently updated leads" (`listLeads` sorted/limited). `getSalespersonDashboard(pool, userId)`: `listLeads` scoped to assigned leads, upcoming `client_visits` for that salesperson, `listTasks` today's/overdue, recent `lead_activities` by that actor, lead pipeline counts by status, and won/lost totals (`CLOSED_WON`/`CLOSED_LOST` counts among their assigned leads).

- [ ] **Step 5: Write and run each module's test (same shape as Step 1), run full suite + typecheck**

Run: `npm test -- dashboard && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard
git commit -m "feat: role-specific dashboard aggregation queries"
```

---

### Task 6: UI — email composer, tasks list, and the real dashboard

**Files:**
- Create: `src/app/(dashboard)/announcements/page.tsx`
- Create: `src/app/(dashboard)/announcements/AnnouncementsView.tsx`
- Test: `src/app/(dashboard)/announcements/AnnouncementsView.test.tsx`
- Create: `src/app/(dashboard)/tasks/page.tsx`
- Create: `src/app/(dashboard)/tasks/TasksView.tsx`
- Test: `src/app/(dashboard)/tasks/TasksView.test.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx` (replace the Phase 2 welcome card with the real per-role widgets)
- Modify: `src/app/(dashboard)/layout.tsx` (add "Announcements" and "Tasks" nav items)

**Interfaces:**
- Consumes: `GET/POST /api/email-announcements`, `POST .../retry` (Tasks 2–3), `GET/POST/PATCH /api/tasks*` (Task 4), the four `getXDashboard` functions (Task 5).

- [ ] **Step 1: Add "Announcements" (visible to `SUPER_ADMIN`/`MARKETING_HEAD` only) and "Tasks" (visible to everyone except `HR`) to `NAV_ITEMS` in `layout.tsx`**

- [ ] **Step 2: Write the failing `AnnouncementsView` test, implement it**

```tsx
it("composes and sends an announcement to all active Salespeople", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  render(<AnnouncementsView initialAnnouncements={[]} />);
  fireEvent.click(screen.getByRole("button", { name: /new announcement/i }));
  fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Q4 kickoff" } });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Join the call at 3pm" } });
  fireEvent.click(screen.getByRole("button", { name: /all salespeople/i }));
  fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
  expect(await screen.findByText(/sent/i)).toBeInTheDocument();
});
```

Follows `TeamView.tsx`'s modal-plus-table structure: a "New Announcement" modal (subject/body/recipient-group picker) and a history table (subject, sent date, per-recipient sent/failed counts, a "Retry failed" button when any row is `FAILED`).

- [ ] **Step 3: Write the failing `TasksView` test, implement it**

A simple filterable list (status, overdue/today/upcoming) with inline status-change buttons, following the same table conventions as `LeadsView.tsx`.

- [ ] **Step 4: Rebuild `src/app/(dashboard)/dashboard/page.tsx` per role**

Call the matching `getXDashboard` for `user.role`, render each role's widgets as a small grid of stat cards (reusing the `dataviz` skill's stat-tile guidance for consistent styling) — this replaces the Phase 2 placeholder welcome card entirely; HR keeps a minimal welcome card (HR has no leads/tasks/email data of its own to show, per its user-management-only scope).

- [ ] **Step 5: Run full suite, typecheck, build, manual verification, commit**

Manually verify in `npm run dev`: send an announcement to "all active Pre-sales," confirm the history table shows per-recipient status; create a task due today and confirm it shows up in the Pre-sales dashboard's "follow-ups due today."

```bash
npm test && npx tsc --noEmit && npx next build
git add src/app/\(dashboard\)/announcements src/app/\(dashboard\)/tasks src/app/\(dashboard\)/dashboard/page.tsx src/app/\(dashboard\)/layout.tsx
git commit -m "feat: email composer, tasks UI, and role-specific dashboard"
```

---

## Self-Review

**Spec coverage:** §9.1/§9.2 (composition fields, use cases) → Task 2. §9.3 (server-only send, delivery tracking, bounded retry, no duplicate resend, role restriction, no exposed secrets) → Tasks 1–3 and their Global Constraints lines. §10's Task half (fields, statuses, today/overdue/upcoming) → Task 4. §11.1–§11.4 (all four dashboards) → Task 5. §14 nav/UI conventions → Task 6.

**Not covered here:** §10's Activities half (already shipped in Phase 3); an automatic background retry scheduler (explicitly deferred — see Global Constraints); rich-text/HTML email composition (explicitly deferred — plain text only, see Global Constraints).

**Review Focus coverage:** sender-role 403 → Task 2 Step 1. Active-only recipient-group resolution → Task 2 Step 1's second test. Retry never re-sends `SENT` rows → Task 3 Step 1. Overdue/today/upcoming computed against query-time `now()` → Task 4 Step 2's bucket test. Each dashboard reuses its module's own visibility rule rather than a fresh ad-hoc query → Task 5 Step 4's explicit instruction to call `listLeads`/`listTasks`, not raw SQL, for the per-role dashboards.
