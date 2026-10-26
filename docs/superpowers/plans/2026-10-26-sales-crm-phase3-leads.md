# Sales CRM — Phase 3: Leads and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Pre-sales (and Marketing Heads) record leads with full client/service-requirement detail, let Marketing Heads review and qualify/reject/return those leads and assign them to a Pre-sales owner and an active Salesperson, and give every lead a searchable/filterable list and a complete activity timeline — all scoped by role and ownership, server-side, with assignment and status changes preserved as history rather than overwritten.

**Architecture:** Three new tables (`leads`, `lead_assignments`, `lead_activities`) extend Phase 1/2's `users`/`sessions`/`audit_logs` foundation. `leads` holds the current state (including the current Pre-sales/Salesperson owner columns, for fast reads); `lead_assignments` is an append-only history of every ownership change; `lead_activities` is the append-only timeline (manual notes/calls/meetings plus auto-logged status-change and assignment entries). Visibility is role **and** ownership scoped (unlike Phase 2's pure role-based `VISIBLE_ROLES`): a library-level `listLeads`/`assertLeadVisible` pair is the single place that encodes "which leads can this signed-in user see," called by every Route Handler — never enforced only in the UI. Likely-duplicate detection is advisory (normalized company name / phone / email / website domain, computed in TS and stored as plain indexed columns — not DB-generated columns, so the normalization rule stays unit-testable and reusable) and is checked via its own endpoint before a save, not as a blocking constraint on create.

**Tech Stack:** Same as Phases 1–2 — Next.js App Router + TypeScript, `pg` raw SQL (no ORM), Zod, Tailwind CSS, Remix Icons, Vitest against the real local `sales_crm` database.

**Spec:** `req.md` §5 (Lead Management), §6 (Lead Review and Assignment), plus the role rules in §3.1–§3.6, the shared tables/indexing rules in §12, and the UI rules in §14.

## Global Constraints

- No ORM: raw `pg` only, parameterized queries (`$1, $2, ...`) (req.md §12).
- All timestamps are `TIMESTAMPTZ`; schema changes are versioned SQL files under `migrations/`, continuing the existing sequence from `0005_add_hr_role.sql` (req.md §12).
- Server-side authorization on every Route Handler, never only hidden in the UI: both the signed-in user's **role** and, for leads, the **specific record's ownership** must be validated (req.md §3.6).
- Leads are never hard-deleted. "Archive" sets `archived_at`; there is no unarchive action in this phase because the spec names only "archive," not "unarchive" (req.md §5.2, §12).
- Assignment changes use one database transaction to update `leads`' current-owner columns and insert the `lead_assignments` history row together; never update one without the other (req.md §6.2).
- Duplicate detection (normalized company name, phone, email, website domain) is advisory: it is surfaced to the caller before save, but creating a lead never fails or is blocked because duplicates exist (req.md §5.2 "Show validation errors before saving" is about field validation, not duplicate blocking).
- Phone is required on every lead; the spec's "make the requirement configurable if needed" is not built — no configuration surface exists until someone asks for one (req.md §5.1).
- `audit_logs` (Phase 2) stays reserved for account/security-sensitive actions. Lead business events (status changes, assignments, manual activities) are recorded in the new `lead_activities`/`lead_assignments` tables instead — this phase does not write lead events into `audit_logs`, avoiding two overlapping history mechanisms.
- Out of scope for this phase (later phases per `TODO.md`): lead transfer (req.md §7), client visits (§8), email announcements (§9), tasks/follow-ups (§10), CSV/Excel import-export (§5.2's "only if approved"), and the `CONVERTED`/`ON_HOLD`/`CLOSED_WON`/`CLOSED_LOST` status transitions (the enum values exist in the DB check constraint so later phases don't need a migration, but no Phase 3 API/UI sets them). HR has no lead permissions at all (req.md §3.2).
- UI is light-theme, Tailwind, Remix Icons, responsive, and reuses the role/status colored-pill convention already established in `src/app/(dashboard)/roleDisplay.ts` and `TeamView.tsx` (req.md §14).

## Review Focus

- A Pre-sales user who is neither the lead's creator nor its current Pre-sales owner must get a 403/404 on that lead's detail, edit, and activity routes — not another user's client data (req.md §3.4, §3.6).
- A Salesperson or Pre-sales user calling the qualify/reject/return or assign routes directly (bypassing the UI) must get 403 — those are Marketing-Head-only regardless of what the UI shows (req.md §3.6, §6.1–§6.2).
- Assigning a lead to a Salesperson (or changing the Pre-sales owner) who is `INACTIVE`, or who holds the wrong role, must be rejected — mirrors the existing "prevent action against an inactive/wrong-role account" pattern already enforced for transfers in §7.2 and must hold here for assignment (req.md §6.2).
- Rejecting a lead, or returning it for more information, without a reason must fail validation — §5.3 defines both `Rejected` and `Closed — Lost` as "with a reason recorded," and the same expectation applies to `More Information Required` (req.md §5.3, §6.1).
- Creating a lead with a duplicate email (unique per Phase 2 convention) is **not** an error — only `users.email` is unique; two leads may legitimately share a contact email, so duplicate leads surface as a warning, never a `409` (req.md §5.2 vs §4.1 — this is the one place the two "uniqueness" rules must not be confused).

---

### Task 1: `leads` table and the normalization library

**Files:**
- Create: `migrations/0006_create_leads_table.sql`
- Create: `src/lib/leads/normalize.ts`
- Test: `src/lib/leads/normalize.test.ts`
- Create: `src/lib/leads/types.ts`
- Create: `src/lib/leads/errors.ts`

**Interfaces:**
- Consumes: nothing new (pure functions + schema).
- Produces: `normalizeCompanyName(name: string): string`, `normalizePhone(phone: string): string`, `extractDomain(website: string | null | undefined): string | null` from `src/lib/leads/normalize.ts`; `LeadRow`, `LeadSource`, `LeadPriority`, `LeadStatus`, `LEAD_SOURCES`, `LEAD_PRIORITIES`, `LEAD_STATUSES` from `src/lib/leads/types.ts`; `LeadNotFoundError`, `LeadNotAccessibleError`, `LeadActionNotAllowedError`, `InvalidLeadReasonError` from `src/lib/leads/errors.ts`. Every later task imports these.

- [ ] **Step 1: Write the failing normalization tests**

```ts
// src/lib/leads/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCompanyName, normalizePhone, extractDomain } from "./normalize";

describe("normalizeCompanyName", () => {
  it("lowercases and strips punctuation/whitespace so near-identical names match", () => {
    expect(normalizeCompanyName("Acme Corp.")).toBe("acmecorp");
    expect(normalizeCompanyName("  ACME   CORP  ")).toBe("acmecorp");
    expect(normalizeCompanyName("Acme, Corp. (Pvt) Ltd.")).toBe("acmecorppvtltd");
  });
});

describe("normalizePhone", () => {
  it("keeps digits only, so formatting differences still match", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("14155550100");
    expect(normalizePhone("415.555.0100")).toBe("4155550100");
  });
});

describe("extractDomain", () => {
  it("extracts a lowercase host with protocol and www stripped", () => {
    expect(extractDomain("https://www.Acme.com/pricing")).toBe("acme.com");
    expect(extractDomain("acme.com")).toBe("acme.com");
    expect(extractDomain(null)).toBeNull();
    expect(extractDomain("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- normalize.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/lib/leads/normalize.ts`**

`normalizeCompanyName`: lowercase, then strip everything but `a-z0-9`. `normalizePhone`: strip everything but digits. `extractDomain`: if falsy input return `null`; otherwise prefix a scheme if none is present so `new URL()` can parse a bare `"acme.com"`, take `.hostname`, strip a leading `"www."`, lowercase it; return `null` if parsing throws.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- normalize.test.ts`
Expected: PASS

- [ ] **Step 5: Write `src/lib/leads/types.ts`**

```ts
export const LEAD_SOURCES = ["WEBSITE_ENQUIRY", "REFERRAL", "COLD_OUTREACH", "EXISTING_CLIENT", "OTHER"] as const;
export type LeadSource = typeof LEAD_SOURCES[number];

export const LEAD_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type LeadPriority = typeof LEAD_PRIORITIES[number];

export const LEAD_STATUSES = [
  "NEW", "PENDING_REVIEW", "MORE_INFO_REQUIRED", "QUALIFIED",
  "CONVERTED", "REJECTED", "ON_HOLD", "CLOSED_WON", "CLOSED_LOST",
] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export type LeadRow = {
  id: number;
  company_name: string;
  company_name_normalized: string;
  contact_person: string | null;
  designation: string | null;
  phone: string;
  phone_normalized: string;
  email: string | null;
  website: string | null;
  website_domain: string | null;
  industry: string | null;
  location: string | null;
  service_requirements: string;
  estimated_budget: string | null;
  lead_source: LeadSource;
  priority: LeadPriority;
  status: LeadStatus;
  status_reason: string | null;
  pre_sales_owner_id: number | null;
  salesperson_owner_id: number | null;
  next_follow_up_at: Date | null;
  notes: string | null;
  archived_at: Date | null;
  created_by: number;
  created_at: Date;
  updated_at: Date;
};
```

(`estimated_budget` stays a string — `pg` returns `NUMERIC` as text by default, and nothing in this phase does arithmetic on it, so parsing it to a `number` would only risk float rounding for no benefit.)

- [ ] **Step 6: Write `src/lib/leads/errors.ts`**

```ts
export class LeadNotFoundError extends Error {}
export class LeadNotAccessibleError extends Error {}
export class LeadActionNotAllowedError extends Error {}
export class InvalidLeadReasonError extends Error {}
```

- [ ] **Step 7: Write `migrations/0006_create_leads_table.sql`**

```sql
CREATE TABLE leads (
  id BIGSERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  company_name_normalized TEXT NOT NULL,
  contact_person TEXT,
  designation TEXT,
  phone TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  email TEXT,
  website TEXT,
  website_domain TEXT,
  industry TEXT,
  location TEXT,
  service_requirements TEXT NOT NULL,
  estimated_budget NUMERIC,
  lead_source TEXT NOT NULL CHECK (lead_source IN ('WEBSITE_ENQUIRY','REFERRAL','COLD_OUTREACH','EXISTING_CLIENT','OTHER')),
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH')),
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (status IN ('NEW','PENDING_REVIEW','MORE_INFO_REQUIRED','QUALIFIED','CONVERTED','REJECTED','ON_HOLD','CLOSED_WON','CLOSED_LOST')),
  status_reason TEXT,
  pre_sales_owner_id BIGINT REFERENCES users(id),
  salesperson_owner_id BIGINT REFERENCES users(id),
  next_follow_up_at TIMESTAMPTZ,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_pre_sales_owner ON leads(pre_sales_owner_id);
CREATE INDEX idx_leads_salesperson_owner ON leads(salesperson_owner_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_company_name_normalized ON leads(company_name_normalized);
CREATE INDEX idx_leads_phone_normalized ON leads(phone_normalized);
CREATE INDEX idx_leads_website_domain ON leads(website_domain);
```

(Default status is `PENDING_REVIEW`, not `NEW` — req.md §6.1 step 2 says a recorded lead is "immediately visible to both Marketing Heads with status Pending Review"; `NEW` stays a valid enum value for a possible future draft-save feature, but nothing in this phase assigns it.)

- [ ] **Step 8: Run full test suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, clean

- [ ] **Step 9: Commit**

```bash
git add migrations/0006_create_leads_table.sql src/lib/leads/normalize.ts src/lib/leads/normalize.test.ts src/lib/leads/types.ts src/lib/leads/errors.ts
git commit -m "feat: add leads table and lead-normalization library"
```

---

### Task 2: Lead creation + duplicate-check

**Files:**
- Create: `src/lib/leads/create.ts`
- Test: `src/lib/leads/create.test.ts`
- Create: `src/lib/leads/duplicates.ts`
- Test: `src/lib/leads/duplicates.test.ts`
- Create: `src/app/api/leads/route.ts` (`POST` only this task; `GET` added in Task 3)
- Create: `src/app/api/leads/duplicates/route.ts`
- Test: `src/app/api/leads/route.test.ts`

**Interfaces:**
- Consumes: `LeadRow`/`LeadSource`/`LeadPriority`/`LEAD_SOURCES`/`LEAD_PRIORITIES` (Task 1), `getCurrentUserFromRequest` (`src/lib/auth/rbac.ts`), `Role` (`src/lib/auth/roles.ts`).
- Produces: `createLead(pool, input): Promise<LeadRow>` and `findPotentialDuplicates(pool, input): Promise<LeadRow[]>` from `src/lib/leads/create.ts` / `src/lib/leads/duplicates.ts`. Tasks 3–7 and the UI tasks call these.

- [ ] **Step 1: Write the failing duplicate-check test**

```ts
// src/lib/leads/duplicates.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "../users/create";
import { createLead } from "./create";
import { findPotentialDuplicates } from "./duplicates";

const adminEmail = `dup-admin-${Date.now()}@example.com`;
let preSalesId: number;
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dup-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dup-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dup-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("findPotentialDuplicates", () => {
  it("flags a lead sharing a normalized company name, phone, or website domain", async () => {
    const original = await createLead(pool, {
      creatorId: preSalesId,
      creatorRole: "PRE_SALES",
      companyName: "Acme Corp.",
      phone: "+1 (415) 555-0100",
      website: "https://www.acme.com",
      serviceRequirements: "CRM rollout",
      leadSource: "REFERRAL",
    });
    leadIds.push(original.id);

    const byName = await findPotentialDuplicates(pool, { companyName: "ACME CORP", phone: "999", serviceRequirements: "x" } as never);
    expect(byName.some((l) => l.id === original.id)).toBe(true);

    const byPhone = await findPotentialDuplicates(pool, { companyName: "Totally Different", phone: "415.555.0100" } as never);
    expect(byPhone.some((l) => l.id === original.id)).toBe(true);

    const noMatch = await findPotentialDuplicates(pool, { companyName: "Nobody Co", phone: "000" } as never);
    expect(noMatch.some((l) => l.id === original.id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- duplicates.test.ts`
Expected: FAIL (`createLead`/`findPotentialDuplicates` not defined)

- [ ] **Step 3: Implement `createLead` in `src/lib/leads/create.ts`**

```ts
export async function createLead(pool: Pool, input: {
  creatorId: number;
  creatorRole: Role;
  companyName: string;
  contactPerson?: string;
  designation?: string;
  phone: string;
  email?: string;
  website?: string;
  industry?: string;
  location?: string;
  serviceRequirements: string;
  estimatedBudget?: number;
  leadSource: LeadSource;
  priority?: LeadPriority;
  notes?: string;
}): Promise<LeadRow>
```

Throw `LeadActionNotAllowedError` unless `input.creatorRole` is `"PRE_SALES"` or `"MARKETING_HEAD"` (req.md §5.1). Compute `company_name_normalized`/`phone_normalized`/`website_domain` via Task 1's normalize functions. Set `pre_sales_owner_id` to `input.creatorId` when `creatorRole === "PRE_SALES"`, else `null`. Insert with `status` left to its `PENDING_REVIEW` default, `created_by = creatorId`, and `RETURNING *`.

- [ ] **Step 4: Implement `findPotentialDuplicates` in `src/lib/leads/duplicates.ts`**

```ts
export async function findPotentialDuplicates(pool: Pool, input: {
  companyName: string;
  phone: string;
  email?: string;
  website?: string;
}): Promise<LeadRow[]>
```

Normalize the same three/four fields, then `SELECT * FROM leads WHERE company_name_normalized = $1 OR phone_normalized = $2 OR (website_domain IS NOT NULL AND website_domain = $3) OR (email IS NOT NULL AND lower(email) = lower($4)) ORDER BY created_at DESC LIMIT 10`, passing `null` for any field the caller didn't supply (a `null` on the right of `=` never matches, which is what we want).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- duplicates.test.ts create.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing `createLead` role-check test**

```ts
// src/lib/leads/create.test.ts (new file, alongside duplicates.test.ts's setup pattern)
it("rejects a Salesperson creating a lead", async () => {
  await expect(
    createLead(pool, { creatorId: salespersonId, creatorRole: "SALESPERSON", companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("defaults a Pre-sales-created lead's pre-sales owner to its creator, with PENDING_REVIEW status", async () => {
  const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Y", phone: "2", serviceRequirements: "z", leadSource: "OTHER" });
  expect(lead.pre_sales_owner_id).toBe(preSalesId);
  expect(lead.status).toBe("PENDING_REVIEW");
});
```

- [ ] **Step 7: Run tests, then implement `POST /api/leads` in `src/app/api/leads/route.ts`**

Mirror `src/app/api/users/route.ts`'s shape: `getCurrentUserFromRequest`, 401 if absent, 403 if `mustChangePassword`, a Zod `createLeadSchema` (`companyName`/`serviceRequirements`/`phone` required non-empty strings; `leadSource: z.enum(LEAD_SOURCES)`; `priority: z.enum(LEAD_PRIORITIES).optional()`; the rest optional strings/number), call `createLead`, catch `LeadActionNotAllowedError` → 403, return `201` with the created row.

- [ ] **Step 8: Implement `GET /api/leads/duplicates` in `src/app/api/leads/duplicates/route.ts`**

Same auth preamble. Zod-validate `companyName`/`phone` (required) and `email`/`website` (optional) from `url.searchParams`. Call `findPotentialDuplicates`, return `{ duplicates }`.

- [ ] **Step 9: Write the failing route test, then confirm it passes**

```ts
// src/app/api/leads/route.test.ts
it("lets an authenticated Pre-sales user create a lead", async () => {
  const res = await postLeads({ companyName: "Route Co", phone: "123", serviceRequirements: "Needs CRM", leadSource: "REFERRAL" }, preSalesCookie);
  expect(res.status).toBe(201);
});

it("rejects an unauthenticated request", async () => {
  const res = await postLeads({ companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" });
  expect(res.status).toBe(401);
});

it("rejects a Salesperson", async () => {
  const res = await postLeads({ companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }, salespersonCookie);
  expect(res.status).toBe(403);
});
```

Run: `npm test -- leads/route.test.ts`
Expected: PASS

- [ ] **Step 10: Run full test suite and typecheck, then commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/leads/create.ts src/lib/leads/create.test.ts src/lib/leads/duplicates.ts src/lib/leads/duplicates.test.ts src/app/api/leads/route.ts src/app/api/leads/route.test.ts src/app/api/leads/duplicates/route.ts
git commit -m "feat: lead creation with advisory duplicate detection"
```

---

### Task 3: Role/ownership-scoped lead list, search, and filters

**Files:**
- Create: `src/lib/leads/list.ts`
- Test: `src/lib/leads/list.test.ts`
- Modify: `src/app/api/leads/route.ts` (add `GET`)
- Modify: `src/app/api/leads/route.test.ts`

**Interfaces:**
- Consumes: `LeadRow`/`LeadStatus`/`LEAD_STATUSES` (Task 1), `createLead` (Task 2, for test fixtures).
- Produces: `listLeads(pool, viewer: { id: number; role: Role }, filters: { status?: LeadStatus; source?: LeadSource; priority?: LeadPriority; ownerId?: number; dateFrom?: Date; dateTo?: Date; q?: string; includeArchived?: boolean }): Promise<LeadRow[]>` from `src/lib/leads/list.ts`. Tasks 8–9 (UI) call this indirectly via the `GET` route.

- [ ] **Step 1: Write the failing visibility tests**

```ts
// src/lib/leads/list.test.ts
describe("listLeads", () => {
  it("lets SUPER_ADMIN and MARKETING_HEAD see every lead", async () => {
    const rows = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, {});
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(true);
  });

  it("scopes PRE_SALES to leads they created or own, never another Pre-sales user's", async () => {
    const rows = await listLeads(pool, { id: preSalesId, role: "PRE_SALES" }, {});
    expect(rows.every((l) => l.created_by === preSalesId || l.pre_sales_owner_id === preSalesId)).toBe(true);
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(false);
  });

  it("scopes SALESPERSON to leads assigned to them", async () => {
    expect(await listLeads(pool, { id: unassignedSalespersonId, role: "SALESPERSON" }, {})).toEqual([]);
  });

  it("excludes archived leads unless includeArchived is set", async () => {
    const withoutArchived = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, {});
    expect(withoutArchived.some((l) => l.id === archivedLead.id)).toBe(false);
    const withArchived = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { includeArchived: true });
    expect(withArchived.some((l) => l.id === archivedLead.id)).toBe(true);
  });

  it("filters by status and searches company name/phone/email", async () => {
    const byStatus = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { status: "PENDING_REVIEW" });
    expect(byStatus.every((l) => l.status === "PENDING_REVIEW")).toBe(true);
    const byQuery = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { q: "Findme" });
    expect(byQuery.some((l) => l.company_name.includes("Findme"))).toBe(true);
  });

  it("HR sees no leads", async () => {
    expect(await listLeads(pool, { id: hrId, role: "HR" }, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- leads/list.test.ts`
Expected: FAIL (`listLeads` not defined)

- [ ] **Step 3: Implement `listLeads` in `src/lib/leads/list.ts`**

Build a `conditions`/`params` array the way `src/lib/users/list.ts` does. Role branch: `SUPER_ADMIN`/`MARKETING_HEAD` → no ownership condition; `PRE_SALES` → `(created_by = $n OR pre_sales_owner_id = $n)`; `SALESPERSON` → `salesperson_owner_id = $n`; `HR` → return `[]` immediately (no query). Add `archived_at IS NULL` unless `filters.includeArchived`. Add `status = $n` / `lead_source = $n` / `priority = $n` / `(pre_sales_owner_id = $n OR salesperson_owner_id = $n)` for `ownerId` / `created_at BETWEEN $n AND $n` when present. Add `(company_name ILIKE $n OR phone ILIKE $n OR email ILIKE $n OR website ILIKE $n)` for `q`. Order by `created_at DESC`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads/list.test.ts`
Expected: PASS

- [ ] **Step 5: Add `GET` to `src/app/api/leads/route.ts`**

Same auth preamble as `POST`. Any authenticated role may call it (visibility is enforced inside `listLeads`, including HR getting `[]`) — this mirrors how `src/app/api/users/route.ts`'s `GET` is role-gated at the route, but here the gate is already total inside the library function, so no extra route-level role check is needed. Zod-validate query params the same way `listQuerySchema` does in `src/app/api/users/route.ts`, add `source`/`ownerId`/`dateFrom`/`dateTo`/`includeArchived`.

- [ ] **Step 6: Write the failing route test, then confirm it passes**

```ts
it("scopes the list to the caller's visible leads", async () => {
  const res = await getLeads(preSalesCookie);
  const body = await res.json();
  expect(body.leads.every((l: { pre_sales_owner_id: number | null; created_by: number }) =>
    l.created_by === preSalesId || l.pre_sales_owner_id === preSalesId)).toBe(true);
});
```

Run: `npm test -- leads/route.test.ts`
Expected: PASS

- [ ] **Step 7: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/leads/list.ts src/lib/leads/list.test.ts src/app/api/leads/route.ts src/app/api/leads/route.test.ts
git commit -m "feat: role/ownership-scoped lead list, search, and filters"
```

---

### Task 4: Lead detail, access guard, and permitted-field edit

**Files:**
- Create: `src/lib/leads/guard.ts`
- Test: `src/lib/leads/guard.test.ts`
- Create: `src/lib/leads/update.ts`
- Test: `src/lib/leads/update.test.ts`
- Create: `src/app/api/leads/[id]/route.ts`
- Test: `src/app/api/leads/[id]/route.test.ts`

**Interfaces:**
- Consumes: `LeadRow`, `LeadNotFoundError`, `LeadNotAccessibleError` (Task 1), `createLead` (Task 2, test fixtures).
- Produces: `assertLeadVisible(pool, viewer: { id: number; role: Role }, leadId: number): Promise<LeadRow>` from `src/lib/leads/guard.ts` (Tasks 5–7 and the UI tasks reuse this for their own per-record checks); `updateLead(pool, input: { actorId: number; actorRole: Role; leadId: number; fields: Partial<{ companyName: string; contactPerson: string; designation: string; phone: string; email: string; website: string; industry: string; location: string; serviceRequirements: string; estimatedBudget: number; priority: LeadPriority; nextFollowUpAt: Date; notes: string }> }): Promise<void>` from `src/lib/leads/update.ts`.

- [ ] **Step 1: Write the failing guard tests**

```ts
// src/lib/leads/guard.test.ts
it("returns the lead for its owner/creator, Marketing Head, or Super Admin", async () => {
  await expect(assertLeadVisible(pool, { id: preSalesId, role: "PRE_SALES" }, myLead.id)).resolves.toMatchObject({ id: myLead.id });
  await expect(assertLeadVisible(pool, { id: mhId, role: "MARKETING_HEAD" }, myLead.id)).resolves.toMatchObject({ id: myLead.id });
});

it("rejects a Pre-sales user who neither created nor owns the lead", async () => {
  await expect(assertLeadVisible(pool, { id: otherPreSalesId, role: "PRE_SALES" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
});

it("rejects a Salesperson the lead isn't assigned to", async () => {
  await expect(assertLeadVisible(pool, { id: salespersonId, role: "SALESPERSON" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
});

it("throws LeadNotFoundError for a non-existent id", async () => {
  await expect(assertLeadVisible(pool, { id: mhId, role: "MARKETING_HEAD" }, 999999999)).rejects.toThrow(LeadNotFoundError);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- leads/guard.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `assertLeadVisible` in `src/lib/leads/guard.ts`**

`SELECT * FROM leads WHERE id = $1`; throw `LeadNotFoundError` if no row. If `viewer.role` is `SUPER_ADMIN`/`MARKETING_HEAD`, return it. If `PRE_SALES`, return it when `created_by === viewer.id || pre_sales_owner_id === viewer.id`, else throw `LeadNotAccessibleError`. If `SALESPERSON`, return it when `salesperson_owner_id === viewer.id`, else throw. Any other role (`HR`) always throws `LeadNotAccessibleError`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads/guard.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing `updateLead` tests**

```ts
// src/lib/leads/update.test.ts
it("lets the owning Pre-sales user update permitted fields", async () => {
  await updateLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { notes: "Called, interested" } });
  const { rows } = await pool.query("SELECT notes FROM leads WHERE id = $1", [myLead.id]);
  expect(rows[0].notes).toBe("Called, interested");
});

it("rejects a Pre-sales user updating a lead they don't own", async () => {
  await expect(
    updateLead(pool, { actorId: otherPreSalesId, actorRole: "PRE_SALES", leadId: myLead.id, fields: { notes: "x" } }),
  ).rejects.toThrow(LeadNotAccessibleError);
});

it("rejects a Salesperson editing any lead field", async () => {
  await expect(
    updateLead(pool, { actorId: salespersonId, actorRole: "SALESPERSON", leadId: myLead.id, fields: { notes: "x" } }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});
```

- [ ] **Step 6: Run tests to verify they fail, then implement `updateLead`**

Throw `LeadActionNotAllowedError` immediately if `actorRole` is `SALESPERSON` or `HR` (Phase 3 grants no field-edit permission to Salespeople — req.md §3.5's "permitted sales-stage fields" belongs to the pipeline features later phases add). Otherwise call `assertLeadVisible(pool, { id: actorId, role: actorRole }, leadId)` (also re-normalizes `company_name`/`phone`/`website` when those fields are present in the update). Build a dynamic `UPDATE leads SET ... , updated_at = now() WHERE id = $n` the way `src/lib/users/update.ts`'s `updateUserProfile` does; no-op (return) if `fields` is empty.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- leads/update.test.ts`
Expected: PASS

- [ ] **Step 8: Implement `GET`/`PATCH /api/leads/[id]` in `src/app/api/leads/[id]/route.ts`**

Mirror `src/app/api/users/[id]/route.ts`'s shape. `GET`: call `assertLeadVisible`, catch `LeadNotFoundError` → 404, `LeadNotAccessibleError` → 404 (not 403 — do not reveal that a lead id exists to a viewer who can't see it), return the row. `PATCH`: Zod-validate the same optional-field shape as `updateLead`'s `fields`, call `updateLead`, catch `LeadActionNotAllowedError`/`LeadNotAccessibleError` → 403, `LeadNotFoundError` → 404.

- [ ] **Step 9: Write the failing route test, then confirm it passes**

```ts
it("404s a lead id that doesn't exist, and 404s one the viewer can't see", async () => {
  expect((await getLead(999999999, mhCookie)).status).toBe(404);
  expect((await getLead(otherPreSalesLead.id, preSalesCookie)).status).toBe(404);
});
```

Run: `npm test -- "leads/\[id\]/route.test.ts"`
Expected: PASS

- [ ] **Step 10: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add "src/lib/leads/guard.ts" "src/lib/leads/guard.test.ts" "src/lib/leads/update.ts" "src/lib/leads/update.test.ts" "src/app/api/leads/[id]/route.ts" "src/app/api/leads/[id]/route.test.ts"
git commit -m "feat: lead detail access guard and permitted-field edit"
```

---

### Task 5: `lead_activities` table and the activity timeline

**Files:**
- Create: `migrations/0007_create_lead_activities_table.sql`
- Create: `src/lib/leads/activities.ts`
- Test: `src/lib/leads/activities.test.ts`
- Create: `src/app/api/leads/[id]/activities/route.ts`
- Test: `src/app/api/leads/[id]/activities/route.test.ts`

**Interfaces:**
- Consumes: `assertLeadVisible` (Task 4).
- Produces: `recordLeadActivity(pool, input: { leadId: number; actorId: number; type: "NOTE" | "CALL" | "MEETING" | "OTHER" | "STATUS_CHANGE" | "ASSIGNMENT"; notes?: string }): Promise<void>` and `listLeadActivities(pool, viewer: { id: number; role: Role }, leadId: number): Promise<LeadActivityRow[]>` from `src/lib/leads/activities.ts`. Tasks 6–7 call `recordLeadActivity` to auto-log status/assignment changes.

- [ ] **Step 1: Write `migrations/0007_create_lead_activities_table.sql`**

```sql
CREATE TABLE lead_activities (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  actor_user_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('NOTE','CALL','MEETING','OTHER','STATUS_CHANGE','ASSIGNMENT')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
```

- [ ] **Step 2: Write the failing activity tests**

```ts
// src/lib/leads/activities.test.ts
it("records and lists activities for a visible lead, oldest first omitted — newest first", async () => {
  await recordLeadActivity(pool, { leadId: myLead.id, actorId: preSalesId, type: "CALL", notes: "Left voicemail" });
  const rows = await listLeadActivities(pool, { id: preSalesId, role: "PRE_SALES" }, myLead.id);
  expect(rows[0]).toMatchObject({ type: "CALL", notes: "Left voicemail" });
});

it("rejects listing activities for a lead the viewer can't see", async () => {
  await expect(listLeadActivities(pool, { id: otherPreSalesId, role: "PRE_SALES" }, myLead.id)).rejects.toThrow(LeadNotAccessibleError);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- leads/activities.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement `src/lib/leads/activities.ts`**

`recordLeadActivity`: plain parameterized `INSERT`, no guard (internal callers already hold a verified `leadId`/actor). `listLeadActivities`: call `assertLeadVisible` first (reuses the exact same visibility rule as the lead itself — an activity is only ever as visible as its lead), then `SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- leads/activities.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `GET`/`POST /api/leads/[id]/activities` in `src/app/api/leads/[id]/activities/route.ts`**

`GET`: auth preamble, `listLeadActivities`, catch not-found/not-accessible → 404. `POST`: Zod `{ type: z.enum(["NOTE","CALL","MEETING","OTHER"]), notes: z.string().trim().min(1).optional() }` (callers cannot POST `STATUS_CHANGE`/`ASSIGNMENT` directly — those are only ever auto-logged by Tasks 6–7), call `assertLeadVisible` then `recordLeadActivity`, reject `SALESPERSON`/`HR`... no — re-read req.md §3.5: Salespeople **do** record "calls, meetings, notes, follow-ups" on their assigned leads. So: call `assertLeadVisible` (which already lets an assigned Salesperson through), and only `HR` is blocked (HR can never see a lead at all, so `assertLeadVisible` already throws for HR — no separate role check is needed here).

- [ ] **Step 7: Write the failing route test, then confirm it passes**

```ts
it("lets an assigned Salesperson record a call activity", async () => {
  const res = await postActivity(assignedLead.id, { type: "CALL", notes: "Discussed pricing" }, salespersonCookie);
  expect(res.status).toBe(201);
});
```

Run: `npm test -- "leads/\[id\]/activities/route.test.ts"`
Expected: PASS

- [ ] **Step 8: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0007_create_lead_activities_table.sql src/lib/leads/activities.ts src/lib/leads/activities.test.ts "src/app/api/leads/[id]/activities/route.ts" "src/app/api/leads/[id]/activities/route.test.ts"
git commit -m "feat: lead activity timeline"
```

---

### Task 6: Review workflow — qualify, reject, return for more information

**Files:**
- Create: `src/lib/leads/review.ts`
- Test: `src/lib/leads/review.test.ts`
- Create: `src/app/api/leads/[id]/review/route.ts`
- Test: `src/app/api/leads/[id]/review/route.test.ts`

**Interfaces:**
- Consumes: `assertLeadVisible` (Task 4), `recordLeadActivity` (Task 5).
- Produces: `reviewLead(pool, input: { actorId: number; actorRole: Role; leadId: number; action: "QUALIFY" | "REJECT" | "RETURN"; reason?: string }): Promise<LeadRow>` from `src/lib/leads/review.ts`. The UI task calls this.

- [ ] **Step 1: Write the failing review tests**

```ts
// src/lib/leads/review.test.ts
it("lets Marketing Head qualify a Pending Review lead", async () => {
  const updated = await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "QUALIFY" });
  expect(updated.status).toBe("QUALIFIED");
});

it("requires a reason to reject, and records it", async () => {
  await expect(
    reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "REJECT" }),
  ).rejects.toThrow(InvalidLeadReasonError);
  const updated = await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "REJECT", reason: "Out of budget" });
  expect(updated).toMatchObject({ status: "REJECTED", status_reason: "Out of budget" });
});

it("requires a reason to return for more information", async () => {
  await expect(
    reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "RETURN" }),
  ).rejects.toThrow(InvalidLeadReasonError);
});

it("rejects a Pre-sales user calling review at all", async () => {
  await expect(
    reviewLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: pendingLead.id, action: "QUALIFY" }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("rejects reviewing a lead that isn't Pending Review or More Info Required", async () => {
  await expect(
    reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: alreadyQualifiedLead.id, action: "QUALIFY" }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("records a STATUS_CHANGE activity for every review action", async () => {
  await reviewLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: pendingLead.id, action: "QUALIFY" });
  const rows = await listLeadActivities(pool, { id: mhId, role: "MARKETING_HEAD" }, pendingLead.id);
  expect(rows[0].type).toBe("STATUS_CHANGE");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- leads/review.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `reviewLead` in `src/lib/leads/review.ts`**

Throw `LeadActionNotAllowedError` unless `actorRole === "MARKETING_HEAD"`. Call `assertLeadVisible` (Marketing Head always passes). Throw `LeadActionNotAllowedError` unless the current `status` is `PENDING_REVIEW` or `MORE_INFO_REQUIRED`. For `REJECT`/`RETURN`, throw `InvalidLeadReasonError` unless `reason?.trim()`. Map `action` → new status (`QUALIFY→QUALIFIED`, `REJECT→REJECTED`, `RETURN→MORE_INFO_REQUIRED`). `UPDATE leads SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`, then `recordLeadActivity(pool, { leadId, actorId, type: "STATUS_CHANGE", notes: reason ?? action })`. No transaction wrapper needed here (single-table update plus one insert into an append-only log — a crash between them loses only the activity-log entry, not correctness of `leads`' own state, which is an acceptable, documented gap at this scale).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- leads/review.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `POST /api/leads/[id]/review` in `src/app/api/leads/[id]/review/route.ts`**

Auth preamble. Zod `{ action: z.enum(["QUALIFY", "REJECT", "RETURN"]), reason: z.string().trim().min(1).optional() }`. Call `reviewLead`, catch `LeadActionNotAllowedError`/`LeadNotAccessibleError` → 403, `LeadNotFoundError` → 404, `InvalidLeadReasonError` → 400.

- [ ] **Step 6: Write the failing route test, then confirm it passes**

```ts
it("400s a reject with no reason", async () => {
  const res = await postReview(pendingLead.id, { action: "REJECT" }, mhCookie);
  expect(res.status).toBe(400);
});
```

Run: `npm test -- "leads/\[id\]/review/route.test.ts"`
Expected: PASS

- [ ] **Step 7: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add src/lib/leads/review.ts src/lib/leads/review.test.ts "src/app/api/leads/[id]/review/route.ts" "src/app/api/leads/[id]/review/route.test.ts"
git commit -m "feat: lead review workflow — qualify, reject, return for more information"
```

---

### Task 7: Assignment and assignment history

**Files:**
- Create: `migrations/0008_create_lead_assignments_table.sql`
- Create: `src/lib/leads/assign.ts`
- Test: `src/lib/leads/assign.test.ts`
- Create: `src/app/api/leads/[id]/assign/route.ts`
- Test: `src/app/api/leads/[id]/assign/route.test.ts`

**Interfaces:**
- Consumes: `assertLeadVisible` (Task 4), `recordLeadActivity` (Task 5).
- Produces: `assignLead(pool, input: { actorId: number; actorRole: Role; leadId: number; salespersonId?: number; preSalesOwnerId?: number }): Promise<LeadRow>` from `src/lib/leads/assign.ts`. The UI task calls this.

- [ ] **Step 1: Write `migrations/0008_create_lead_assignments_table.sql`**

```sql
CREATE TABLE lead_assignments (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT NOT NULL REFERENCES leads(id),
  pre_sales_owner_id BIGINT REFERENCES users(id),
  salesperson_owner_id BIGINT REFERENCES users(id),
  changed_by BIGINT NOT NULL REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_assignments_lead_id ON lead_assignments(lead_id);
```

- [ ] **Step 2: Write the failing assignment tests**

```ts
// src/lib/leads/assign.test.ts
it("assigns a qualified lead to an active Salesperson and records history", async () => {
  const updated = await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
  expect(updated.salesperson_owner_id).toBe(salespersonId);
  const { rows } = await pool.query("SELECT * FROM lead_assignments WHERE lead_id = $1 ORDER BY changed_at", [qualifiedLead.id]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ salesperson_owner_id: salespersonId, changed_by: mhId });
});

it("accumulates a second history row on reassignment rather than overwriting the first", async () => {
  await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId });
  await assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: otherSalespersonId });
  const { rows } = await pool.query("SELECT * FROM lead_assignments WHERE lead_id = $1 ORDER BY changed_at", [qualifiedLead.id]);
  expect(rows).toHaveLength(2);
});

it("rejects assigning to an inactive Salesperson", async () => {
  await expect(
    assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: inactiveSalespersonId }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("rejects assigning a user who isn't a Salesperson", async () => {
  await expect(
    assignLead(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: qualifiedLead.id, salespersonId: preSalesId }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});

it("rejects a Pre-sales user calling assign", async () => {
  await expect(
    assignLead(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: qualifiedLead.id, salespersonId }),
  ).rejects.toThrow(LeadActionNotAllowedError);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- leads/assign.test.ts`
Expected: FAIL

- [ ] **Step 4: Implement `assignLead` in `src/lib/leads/assign.ts`**

Throw `LeadActionNotAllowedError` unless `actorRole === "MARKETING_HEAD"`. Call `assertLeadVisible`. For each of `salespersonId`/`preSalesOwnerId` that's present, `SELECT role, status FROM users WHERE id = $1` and throw `LeadActionNotAllowedError` unless `status === "ACTIVE"` and the role matches (`SALESPERSON`/`PRE_SALES` respectively). Run in one transaction (`BEGIN`/`COMMIT`/`ROLLBACK` the way `src/lib/migrate.ts` does): `UPDATE leads SET salesperson_owner_id = COALESCE($1, salesperson_owner_id), pre_sales_owner_id = COALESCE($2, pre_sales_owner_id), updated_at = now() WHERE id = $3 RETURNING *`, then `INSERT INTO lead_assignments (lead_id, pre_sales_owner_id, salesperson_owner_id, changed_by) VALUES (...)` using the row's *resulting* owner columns (not just the changed one, so a history row always shows the full ownership snapshot at that point in time). After commit, `recordLeadActivity(pool, { leadId, actorId, type: "ASSIGNMENT", notes: ... })`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- leads/assign.test.ts`
Expected: PASS

- [ ] **Step 6: Implement `POST /api/leads/[id]/assign` in `src/app/api/leads/[id]/assign/route.ts`**

Auth preamble. Zod `{ salespersonId: z.number().int().optional(), preSalesOwnerId: z.number().int().optional() }`, refine that at least one is present. Call `assignLead`, catch `LeadActionNotAllowedError`/`LeadNotAccessibleError` → 403, `LeadNotFoundError` → 404.

- [ ] **Step 7: Write the failing route test, then confirm it passes**

```ts
it("rejects assigning an inactive salesperson with 403", async () => {
  const res = await postAssign(qualifiedLead.id, { salespersonId: inactiveSalespersonId }, mhCookie);
  expect(res.status).toBe(403);
});
```

Run: `npm test -- "leads/\[id\]/assign/route.test.ts"`
Expected: PASS

- [ ] **Step 8: Run full suite, typecheck, commit**

```bash
npm test && npx tsc --noEmit
git add migrations/0008_create_lead_assignments_table.sql src/lib/leads/assign.ts src/lib/leads/assign.test.ts "src/app/api/leads/[id]/assign/route.ts" "src/app/api/leads/[id]/assign/route.test.ts"
git commit -m "feat: lead assignment with history"
```

---

### Task 8: Leads UI — list, search/filter, and create

**Files:**
- Create: `src/app/(dashboard)/leads/page.tsx`
- Create: `src/app/(dashboard)/leads/LeadsView.tsx`
- Test: `src/app/(dashboard)/leads/LeadsView.test.tsx`
- Create: `src/app/(dashboard)/leadDisplay.ts`
- Modify: `src/app/(dashboard)/layout.tsx` (add the "Leads" nav item)

**Interfaces:**
- Consumes: `GET/POST /api/leads`, `GET /api/leads/duplicates` (Tasks 2–3), `ROLE_BADGE_CLASSES`-style pattern from `src/app/(dashboard)/roleDisplay.ts`.
- Produces: `LEAD_STATUS_LABELS`, `LEAD_STATUS_BADGE_CLASSES`, `LEAD_PRIORITY_BADGE_CLASSES` from `src/app/(dashboard)/leadDisplay.ts` — Task 9 reuses these on the detail page.

- [ ] **Step 1: Write `src/app/(dashboard)/leadDisplay.ts`**

Mirror `roleDisplay.ts`'s shape: a `Record<LeadStatus, string>` label map (`PENDING_REVIEW: "Pending review"`, etc., sentence case per req.md §14/this session's established copy convention), and `Record<LeadStatus, string>` / `Record<LeadPriority, string>` Tailwind soft-pill class maps reusing the existing palette (e.g. amber for `PENDING_REVIEW`, sky for `QUALIFIED`, emerald for `CONVERTED`/`CLOSED_WON`, rose for `REJECTED`/`CLOSED_LOST`, zinc for `ON_HOLD`/`NEW`, teal for `MORE_INFO_REQUIRED`).

- [ ] **Step 2: Add the "Leads" nav item in `src/app/(dashboard)/layout.tsx`**

Add `...(user.role !== "HR" ? [{ href: "/leads", label: "Leads", icon: "ri-contacts-line" }] : [])` to `NAV_ITEMS` (every role except HR can see some slice of leads, per Task 3's visibility rule).

- [ ] **Step 3: Write `src/app/(dashboard)/leads/page.tsx`**

```tsx
export default async function LeadsPage() {
  const user = await requireRole(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
  // then redirect HR to /dashboard — HR has no lead visibility at all (Task 3's listLeads
  // already returns [] for HR, but there's no reason to show HR an always-empty Leads page)
  ...
}
```

Call `listLeads(pool, user, {})`, pass `initialLeads`, `viewerRole={user.role}` to `LeadsView`.

- [ ] **Step 4: Write the failing `LeadsView` test**

```tsx
// src/app/(dashboard)/leads/LeadsView.test.tsx
it("renders the initial lead list and opens the create modal with a duplicate warning", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).includes("/duplicates")) return new Response(JSON.stringify({ duplicates: [{ id: 1, company_name: "Acme Corp" }] }));
    return new Response(JSON.stringify({ id: 2 }), { status: 201 });
  });
  render(<LeadsView initialLeads={sampleLeads} viewerRole="PRE_SALES" />);
  fireEvent.click(screen.getByRole("button", { name: /new lead/i }));
  fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme Corp" } });
  fireEvent.blur(screen.getByLabelText(/company/i));
  expect(await screen.findByText(/similar lead/i)).toBeInTheDocument();
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- LeadsView.test.tsx`
Expected: FAIL (component not found)

- [ ] **Step 6: Implement `src/app/(dashboard)/leads/LeadsView.tsx`**

Follow `TeamView.tsx`'s established structure exactly: one card (`overflow-hidden rounded-lg border ...`) with a filter toolbar (search/status/source/priority/date-range) + "New Lead" button, then a table using `LEAD_STATUS_BADGE_CLASSES`/`LEAD_PRIORITY_BADGE_CLASSES` pills for the status/priority columns and an avatar-style initial badge for the owner columns. The create modal calls `GET /api/leads/duplicates` on company-name/phone blur (debounced is unnecessary at this data size — a plain blur handler is enough) and shows a dismissible warning listing the matches by name/link, without blocking the "Create" submit button.

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- LeadsView.test.tsx`
Expected: PASS

- [ ] **Step 8: Run full suite, typecheck, build, commit**

```bash
npm test && npx tsc --noEmit && npx next build
git add "src/app/(dashboard)/leads/page.tsx" "src/app/(dashboard)/leads/LeadsView.tsx" "src/app/(dashboard)/leads/LeadsView.test.tsx" "src/app/(dashboard)/leadDisplay.ts" "src/app/(dashboard)/layout.tsx"
git commit -m "feat: Leads list, search/filter, and create with duplicate warning"
```

---

### Task 9: Lead detail UI — timeline, review, and assignment

**Files:**
- Create: `src/app/(dashboard)/leads/[id]/page.tsx`
- Create: `src/app/(dashboard)/leads/[id]/LeadDetailView.tsx`
- Test: `src/app/(dashboard)/leads/[id]/LeadDetailView.test.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/leads/[id]`, `GET/POST /api/leads/[id]/activities`, `POST /api/leads/[id]/review`, `POST /api/leads/[id]/assign` (Tasks 4–7), `LEAD_STATUS_LABELS`/badge classes (Task 8).

- [ ] **Step 1: Write `src/app/(dashboard)/leads/[id]/page.tsx`**

```tsx
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let lead;
  try {
    lead = await assertLeadVisible(pool, user, Number(id));
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) notFound();
    throw error;
  }
  const activities = await listLeadActivities(pool, user, lead.id);
  return <LeadDetailView lead={lead} activities={activities} viewerRole={user.role} viewerId={user.id} />;
}
```

- [ ] **Step 2: Write the failing `LeadDetailView` tests**

```tsx
it("shows qualify/reject/return actions only for Marketing Head on a Pending Review lead", () => {
  render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
  expect(screen.getByRole("button", { name: /qualify/i })).toBeInTheDocument();
});

it("hides review actions for a Pre-sales viewer", () => {
  render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
  expect(screen.queryByRole("button", { name: /qualify/i })).not.toBeInTheDocument();
});

it("requires a reason before submitting a reject", async () => {
  render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
  fireEvent.click(screen.getByRole("button", { name: /reject/i }));
  fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
  expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- LeadDetailView.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implement `src/app/(dashboard)/leads/[id]/LeadDetailView.tsx`**

A header card (company/contact/service-requirement fields, editable inline for Marketing Head and the owning Pre-sales user, following `TeamView.tsx`'s edit-modal pattern), a status/priority pill row (`leadDisplay.ts` classes), a Marketing-Head-only "Qualify / Reject / Return" action row (reject/return open a small reason-prompt dialog mirroring the existing confirm-dialog pattern in `TeamView.tsx`), a Marketing-Head-only assignment panel (two selects: Pre-sales owner, Salesperson — populated from a small `GET /api/users?role=PRE_SALES` / `?role=SALESPERSON` fetch), and an activity timeline (list + a "Log activity" form with a type select restricted to `NOTE`/`CALL`/`MEETING`/`OTHER`, visible to anyone who can see the lead).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- LeadDetailView.test.tsx`
Expected: PASS

- [ ] **Step 6: Manual verification in a running app**

Start `npm run dev`, sign in as a seeded Super Admin, create an HR → Marketing Head → Pre-sales → Salesperson chain (reusing the pattern from Phase 2's manual verification), create a lead as Pre-sales, qualify and assign it as Marketing Head, and record an activity as the assigned Salesperson. Confirm the "Leads" nav item is absent for HR.

- [ ] **Step 7: Run full suite, typecheck, build, commit**

```bash
npm test && npx tsc --noEmit && npx next build
git add "src/app/(dashboard)/leads/[id]/page.tsx" "src/app/(dashboard)/leads/[id]/LeadDetailView.tsx" "src/app/(dashboard)/leads/[id]/LeadDetailView.test.tsx"
git commit -m "feat: lead detail page — timeline, review, and assignment"
```

---

## Self-Review

**Spec coverage:** §5.1 (fields, lead sources) → Tasks 1–2. §5.2 (create/view/edit/archive, search/filter, duplicate detection, activity timeline) → Tasks 2–5, 8 (archive itself is a one-line `PATCH` setting `archived_at`, folded into Task 4's `updateLead` rather than a separate task — it's one column flip, not a new subsystem). §5.3 (statuses) → Task 1's enum + Task 6. §6.1 (review workflow) → Task 6. §6.2 (assignment rules/history) → Task 7. §3.1–§3.6 (role/ownership authorization) → Task 3's `listLeads` and Task 4's `assertLeadVisible`, reused by every later task. §12 (indexes, transactions, soft-archive, no ORM) → Task 1's indexes, Task 7's transaction, Task 4's `archived_at`. §14 (nav, colored badges, confirmation dialogs) → Task 8.

**Not covered here (confirmed out of scope, see Global Constraints):** §7 transfer, §8 visits, §9 email, §10 tasks, §5.2's CSV import/export, and the `CONVERTED`/`ON_HOLD`/`CLOSED_WON`/`CLOSED_LOST` transitions.

**Review Focus coverage:** ownership-scoped 403/404 → Task 4 Steps 1, 9. Marketing-Head-only review/assign → Task 6 Step 1, Task 7 Steps 2, 7. Inactive/wrong-role assignment target → Task 7 Steps 2, 7. Reason required on reject/return → Task 6 Steps 1, 6. Duplicate leads are advisory, not a `409` → Task 2 Step 1 (and the Global Constraints line makes the "two different uniqueness rules" distinction explicit for the implementer).
