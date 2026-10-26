# Sales CRM — Phase 2: User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Super Admin create Marketing Head accounts, let Marketing Heads create/manage Pre-sales and Salesperson accounts, and give every new account a secure temporary-password activation flow — all shared across both Marketing Heads, all server-side role-enforced, and all security-sensitive changes recorded in an audit log.

**Architecture:** Extends Phase 1's `users`/`sessions` foundation. A new `audit_logs` table records every user-management mutation. A role-hierarchy rule (`canManage`) is the single source of truth for who may create/edit/activate/deactivate/reset which role, enforced in library functions the Route Handlers call — never only hidden in the UI. New accounts get a server-generated temporary password (shown once in the HTTP response, never logged/persisted in the clear) and must change it before reaching the dashboard, via a `must_change_password` flag re-checked on every login/session read.

**Tech Stack:** Same as Phase 1 — Next.js App Router + TypeScript, `pg` raw SQL (no ORM), Argon2id, Zod, Tailwind CSS, Remix Icons, Vitest against the real local `sales_crm` database.

**Spec:** `req.md` (sections 3, 3.5, 4, 12, 13, 14, 16 Phase 2, 17 items 1–3, 18 are the relevant ones for this phase)

## Global Constraints

- No ORM: raw `pg` only, parameterized queries (`$1, $2, ...`).
- Passwords (including temporary passwords) are hashed with Argon2id; a temporary password is returned exactly once in the creating/resetting HTTP response and is never logged, never stored in the clear, and never written into `audit_logs.details` (req.md §13).
- Role hierarchy is strict and enforced server-side in every library function and Route Handler, never only in the UI: `SUPER_ADMIN` may create/edit/activate/deactivate/reset-access only `MARKETING_HEAD` accounts; `MARKETING_HEAD` may do so only for `PRE_SALES`/`SALESPERSON` accounts. Neither may manage its own or a higher/equal role (req.md §3, §3.5).
- Users created by one Marketing Head are immediately visible to and manageable by both Marketing Heads — there is no per-creator isolation (req.md §3.2, §18).
- Never hard-delete a user; deactivation only flips `status` to `'INACTIVE'` (req.md §4.2).
- Security-sensitive changes — user created, profile updated, activated, deactivated, access reset, password changed — are recorded in `audit_logs` (req.md §3.5, §13).
- All timestamps are `TIMESTAMPTZ`; schema changes are versioned SQL files under `migrations/` (req.md §12).
- UI is light-theme, Tailwind, Remix Icons, responsive; deactivation requires a confirmation dialog; navigation shows only the items the signed-in role may use (req.md §14).

## Review Focus

- A user created by one Marketing Head must be visible and manageable by the *other* Marketing Head too — not scoped to its creator (req.md §3.2's shared-workspace requirement; this is Acceptance Criterion #3).
- A `MARKETING_HEAD` (or lower role) attempting to create/edit/activate a `SUPER_ADMIN` or `MARKETING_HEAD` account — or a `PRE_SALES`/`SALESPERSON` calling any `/api/users*` route at all — must be rejected by the server with 401/403, never a 200, regardless of what the UI shows.
- A temporary password must never be recoverable after its one HTTP response — specifically, it must never appear inside the `audit_logs.details` JSON for the action that generated it.
- Deactivating a user must only flip `status`; the row, its id, and anything that will later reference it must remain intact — and (building on Phase 1's `getSessionUser`) a deactivated user's existing session must stop working on its very next request.
- Creating a user with an email that's already in use must return a clean `409`, not an unhandled Postgres unique-violation `500`.

---

### Task 1: Role-hierarchy rule, `must_change_password` column, and `audit_logs` table

**Files:**
- Modify: `src/lib/auth/roles.ts`
- Create: `migrations/0003_add_must_change_password_to_users.sql`
- Create: `migrations/0004_create_audit_logs_table.sql`
- Create: `src/lib/audit/log.ts`
- Test: `src/lib/audit/log.test.ts`
- Test: `src/lib/auth/roles.test.ts`

**Interfaces:**
- Consumes: `pool`/`query` (`src/lib/db.ts`), `runMigrations` (`src/lib/migrate.ts`), `Role`/`ROLES` (`src/lib/auth/roles.ts`, existing).
- Produces: `canManage(viewerRole: Role, targetRole: Role): boolean` and `creatableRolesFor(viewerRole: Role): readonly Role[]` from `src/lib/auth/roles.ts`; `recordAuditLog(pool: Pool, entry: { actorUserId: number; action: string; targetTable?: string; targetId?: number; details?: Record<string, unknown> }): Promise<void>` from `src/lib/audit/log.ts`. Tasks 3, 5, 6, 7 call `canManage`/`creatableRolesFor` and `recordAuditLog`; Task 4 reads the `must_change_password` column indirectly via Task 7's session changes.

- [ ] **Step 1: Write the failing roles test**

```ts
// src/lib/auth/roles.test.ts
import { describe, it, expect } from "vitest";
import { canManage, creatableRolesFor } from "./roles";

describe("canManage", () => {
  it("lets SUPER_ADMIN manage only MARKETING_HEAD", () => {
    expect(canManage("SUPER_ADMIN", "MARKETING_HEAD")).toBe(true);
    expect(canManage("SUPER_ADMIN", "PRE_SALES")).toBe(false);
    expect(canManage("SUPER_ADMIN", "SALESPERSON")).toBe(false);
    expect(canManage("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
  });

  it("lets MARKETING_HEAD manage only PRE_SALES and SALESPERSON", () => {
    expect(canManage("MARKETING_HEAD", "PRE_SALES")).toBe(true);
    expect(canManage("MARKETING_HEAD", "SALESPERSON")).toBe(true);
    expect(canManage("MARKETING_HEAD", "MARKETING_HEAD")).toBe(false);
    expect(canManage("MARKETING_HEAD", "SUPER_ADMIN")).toBe(false);
  });

  it("lets PRE_SALES and SALESPERSON manage nobody", () => {
    expect(canManage("PRE_SALES", "SALESPERSON")).toBe(false);
    expect(canManage("SALESPERSON", "PRE_SALES")).toBe(false);
  });
});

describe("creatableRolesFor", () => {
  it("returns the exact creatable set per role", () => {
    expect(creatableRolesFor("SUPER_ADMIN")).toEqual(["MARKETING_HEAD"]);
    expect(creatableRolesFor("MARKETING_HEAD")).toEqual(["PRE_SALES", "SALESPERSON"]);
    expect(creatableRolesFor("PRE_SALES")).toEqual([]);
    expect(creatableRolesFor("SALESPERSON")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- roles.test.ts`
Expected: FAIL (`canManage`/`creatableRolesFor` not exported)

- [ ] **Step 3: Implement in `src/lib/auth/roles.ts`**

Add below the existing `ROLES`/`Role` exports:

```ts
const MANAGEABLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ["MARKETING_HEAD"],
  MARKETING_HEAD: ["PRE_SALES", "SALESPERSON"],
  PRE_SALES: [],
  SALESPERSON: [],
};

export function creatableRolesFor(viewerRole: Role): readonly Role[] {
  return MANAGEABLE_ROLES[viewerRole];
}

export function canManage(viewerRole: Role, targetRole: Role): boolean {
  return MANAGEABLE_ROLES[viewerRole].includes(targetRole);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- roles.test.ts`
Expected: PASS

- [ ] **Step 5: Write `migrations/0003_add_must_change_password_to_users.sql`**

```sql
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
```

(`DEFAULT false` applies to existing rows too, including the seeded Super Admin — it is not retroactively forced to change its known `admin`/`1234` password. Only rows this phase's code explicitly inserts/updates with `must_change_password = true` are affected.)

- [ ] **Step 6: Write `migrations/0004_create_audit_logs_table.sql`**

```sql
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  target_table TEXT,
  target_id BIGINT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

- [ ] **Step 7: Write the failing audit-log test**

```ts
// src/lib/audit/log.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { recordAuditLog } from "./log";

const email = `audit-log-test-${Date.now()}@example.com`;
let actorId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  actorId = (await seedSuperAdmin(pool, { email, name: "Audit Test", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [actorId]);
  await pool.query("DELETE FROM users WHERE id = $1", [actorId]);
});

describe("recordAuditLog", () => {
  it("writes a row with the given action, target, and details", async () => {
    await recordAuditLog(pool, {
      actorUserId: actorId,
      action: "user.created",
      targetTable: "users",
      targetId: actorId,
      details: { role: "MARKETING_HEAD" },
    });

    const { rows } = await pool.query(
      "SELECT action, target_table, target_id, details FROM audit_logs WHERE actor_user_id = $1",
      [actorId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("user.created");
    expect(rows[0].target_table).toBe("users");
    expect(rows[0].target_id).toBe(actorId);
    expect(rows[0].details).toEqual({ role: "MARKETING_HEAD" });
  });

  it("allows omitting targetTable/targetId/details", async () => {
    await recordAuditLog(pool, { actorUserId: actorId, action: "user.password_changed" });
    const { rows } = await pool.query(
      "SELECT target_table, target_id, details FROM audit_logs WHERE actor_user_id = $1 AND action = 'user.password_changed'",
      [actorId],
    );
    expect(rows[0].target_table).toBeNull();
    expect(rows[0].target_id).toBeNull();
    expect(rows[0].details).toBeNull();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- log.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 9: Implement `src/lib/audit/log.ts`**

```ts
import type { Pool } from "pg";

export async function recordAuditLog(
  pool: Pool,
  entry: {
    actorUserId: number;
    action: string;
    targetTable?: string;
    targetId?: number;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, target_table, target_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      entry.actorUserId,
      entry.action,
      entry.targetTable ?? null,
      entry.targetId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
    ],
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- log.test.ts`
Expected: PASS

- [ ] **Step 11: Run migrations against the real `sales_crm` database**

Run: `npm run migrate`
Verify: `psql sales_crm -c "\d users"` shows `must_change_password`, and `psql sales_crm -c "\d audit_logs"` shows the new table.

- [ ] **Step 12: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts migrations/0003_add_must_change_password_to_users.sql migrations/0004_create_audit_logs_table.sql src/lib/audit/log.ts src/lib/audit/log.test.ts
git commit -m "feat: role-hierarchy rule, must_change_password column, audit_logs table"
```

---

### Task 2: `requireRole()` page guard and temporary-password generator

**Files:**
- Modify: `src/lib/auth/rbac.ts`
- Modify: `src/lib/auth/passwords.ts`
- Test: `src/lib/auth/passwords.test.ts`

**Interfaces:**
- Consumes: `requireUser()`, `AuthUser` (`src/lib/auth/rbac.ts`, existing); `Role` (`src/lib/auth/roles.ts`).
- Produces: `requireRole(roles: Role[]): Promise<AuthUser>` from `rbac.ts`; `generateTempPassword(): string` from `passwords.ts`. Task 8's `/team` page calls `requireRole(["SUPER_ADMIN", "MARKETING_HEAD"])`; Tasks 3 and 6 call `generateTempPassword()`.

- [ ] **Step 1: Implement `requireRole` in `src/lib/auth/rbac.ts`**

Add below `requireUser`:

```ts
/**
 * Like `requireUser`, but also requires the signed-in user's role to be one
 * of `roles` — redirecting to `/dashboard` (not `/login`, since the user IS
 * authenticated, just not authorized for this page) otherwise.
 */
export async function requireRole(roles: Role[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
```

No test for this step: it is a thin composition of two already-tested primitives (`requireUser`, `redirect`), and `redirect`'s throw-based control flow isn't meaningfully testable outside a real request — Task 8's manual verification exercises it end-to-end.

- [ ] **Step 2: Write the failing temp-password test**

```ts
// src/lib/auth/passwords.test.ts (append to the existing file)
import { generateTempPassword } from "./passwords";

describe("generateTempPassword", () => {
  it("returns a 12-character base64url string", () => {
    const password = generateTempPassword();
    expect(password).toHaveLength(12);
    expect(password).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("returns a different value on each call", () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- passwords.test.ts`
Expected: FAIL (`generateTempPassword` not exported)

- [ ] **Step 4: Implement `generateTempPassword` in `src/lib/auth/passwords.ts`**

Add `import crypto from "node:crypto";` at the top, then:

```ts
/** A one-time, server-generated temporary password: 9 random bytes as base64url (12 chars). */
export function generateTempPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- passwords.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth/rbac.ts src/lib/auth/passwords.ts src/lib/auth/passwords.test.ts
git commit -m "feat: requireRole page guard and generateTempPassword"
```

---

### Task 3: User creation

**Files:**
- Create: `src/lib/users/errors.ts`
- Create: `src/lib/users/create.ts`
- Test: `src/lib/users/create.test.ts`
- Create: `src/app/api/users/route.ts` (POST only — Task 4 adds GET to this same file)
- Test: `src/app/api/users/route.test.ts`

**Interfaces:**
- Consumes: `canManage` (Task 1), `generateTempPassword`, `hashPassword` (Task 2 / existing), `recordAuditLog` (Task 1), `pool` (`src/lib/db.ts`), `getCurrentUser` (`src/lib/auth/rbac.ts`), `ROLES`/`Role` (`src/lib/auth/roles.ts`).
- Produces: `RoleNotManageableError`, `EmailAlreadyExistsError` (both `extends Error`) from `src/lib/users/errors.ts`; `createUser(pool: Pool, input: { creatorId: number; creatorRole: Role; role: Role; name: string; email: string }): Promise<{ id: number; email: string; tempPassword: string }>` from `src/lib/users/create.ts`. `POST /api/users`. Task 5 reuses `RoleNotManageableError`/`EmailAlreadyExistsError`; Task 6 reuses `RoleNotManageableError`.

- [ ] **Step 1: Write `src/lib/users/errors.ts`**

```ts
export class RoleNotManageableError extends Error {}
export class EmailAlreadyExistsError extends Error {}
```

- [ ] **Step 2: Write the failing `createUser` test**

```ts
// src/lib/users/create.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { verifyPassword } from "../auth/passwords";
import { createUser } from "./create";
import { RoleNotManageableError, EmailAlreadyExistsError } from "./errors";

const superAdminEmail = `create-user-admin-${Date.now()}@example.com`;
let superAdminId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

describe("createUser", () => {
  it("lets SUPER_ADMIN create a MARKETING_HEAD with a hashed one-time temp password", async () => {
    const email = `mh-${Date.now()}@example.com`;
    createdEmails.push(email);

    const result = await createUser(pool, {
      creatorId: superAdminId,
      creatorRole: "SUPER_ADMIN",
      role: "MARKETING_HEAD",
      name: "New Marketing Head",
      email,
    });

    expect(result.tempPassword).toHaveLength(12);

    const { rows } = await pool.query(
      "SELECT role, password_hash, status, created_by, must_change_password FROM users WHERE id = $1",
      [result.id],
    );
    expect(rows[0].role).toBe("MARKETING_HEAD");
    expect(rows[0].status).toBe("ACTIVE");
    expect(rows[0].created_by).toBe(superAdminId);
    expect(rows[0].must_change_password).toBe(true);
    expect(await verifyPassword(rows[0].password_hash, result.tempPassword)).toBe(true);
  });

  it("rejects SUPER_ADMIN creating a PRE_SALES account", async () => {
    await expect(
      createUser(pool, {
        creatorId: superAdminId,
        creatorRole: "SUPER_ADMIN",
        role: "PRE_SALES",
        name: "Should Fail",
        email: `should-fail-${Date.now()}@example.com`,
      }),
    ).rejects.toThrow(RoleNotManageableError);
  });

  it("rejects a duplicate email with EmailAlreadyExistsError, not a raw DB error", async () => {
    const email = `dup-${Date.now()}@example.com`;
    createdEmails.push(email);

    await createUser(pool, {
      creatorId: superAdminId,
      creatorRole: "SUPER_ADMIN",
      role: "MARKETING_HEAD",
      name: "First",
      email,
    });

    await expect(
      createUser(pool, {
        creatorId: superAdminId,
        creatorRole: "SUPER_ADMIN",
        role: "MARKETING_HEAD",
        name: "Second",
        email,
      }),
    ).rejects.toThrow(EmailAlreadyExistsError);
  });

  it("never writes the temp password into the audit log details", async () => {
    const email = `audit-check-${Date.now()}@example.com`;
    createdEmails.push(email);

    const result = await createUser(pool, {
      creatorId: superAdminId,
      creatorRole: "SUPER_ADMIN",
      role: "MARKETING_HEAD",
      name: "Audit Check",
      email,
    });

    const { rows } = await pool.query("SELECT details FROM audit_logs WHERE target_id = $1", [result.id]);
    expect(JSON.stringify(rows[0].details)).not.toContain(result.tempPassword);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- create.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement `createUser` in `src/lib/users/create.ts`**

```ts
import type { Pool } from "pg";
import { hashPassword, generateTempPassword } from "../auth/passwords";
import { canManage, type Role } from "../auth/roles";
import { recordAuditLog } from "../audit/log";
import { RoleNotManageableError, EmailAlreadyExistsError } from "./errors";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function createUser(
  pool: Pool,
  input: { creatorId: number; creatorRole: Role; role: Role; name: string; email: string },
): Promise<{ id: number; email: string; tempPassword: string }> {
  if (!canManage(input.creatorRole, input.role)) {
    throw new RoleNotManageableError(`${input.creatorRole} cannot create ${input.role} accounts`);
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  let id: number;
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (role, name, email, password_hash, status, created_by, must_change_password)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, true)
       RETURNING id`,
      [input.role, input.name, input.email, passwordHash, input.creatorId],
    );
    id = rows[0].id;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new EmailAlreadyExistsError(`${input.email} is already in use`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.creatorId,
    action: "user.created",
    targetTable: "users",
    targetId: id,
    details: { role: input.role, email: input.email },
  });

  return { id, email: input.email, tempPassword };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- create.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing route test**

```ts
// src/app/api/users/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../lib/db";
import { runMigrations } from "../../../lib/migrate";
import { seedSuperAdmin } from "../../../lib/auth/seed";
import { createSession } from "../../../lib/auth/session";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import { POST } from "./route";

const superAdminEmail = `route-create-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

function postUsers(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/users", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/users", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await postUsers({ role: "MARKETING_HEAD", name: "X", email: "x@example.com" });
    expect(res.status).toBe(401);
  });

  it("lets an authenticated SUPER_ADMIN create a MARKETING_HEAD", async () => {
    const email = `route-mh-${Date.now()}@example.com`;
    createdEmails.push(email);

    const res = await postUsers(
      { role: "MARKETING_HEAD", name: "Route MH", email },
      `${SESSION_COOKIE_NAME}=${superAdminToken}`,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe(email);
    expect(typeof body.tempPassword).toBe("string");
  });

  it("returns 403 (not 500) when the role can't be created by this actor", async () => {
    const res = await postUsers(
      { role: "PRE_SALES", name: "Should Fail", email: `route-fail-${Date.now()}@example.com` },
      `${SESSION_COOKIE_NAME}=${superAdminToken}`,
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- api/users/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 8: Implement `src/app/api/users/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../lib/db";
import { getCurrentUser } from "../../../lib/auth/rbac";
import { ROLES } from "../../../lib/auth/roles";
import { createUser } from "../../../lib/users/create";
import { RoleNotManageableError, EmailAlreadyExistsError } from "../../../lib/users/errors";

const createUserSchema = z.object({
  role: z.enum(ROLES),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const created = await createUser(pool, {
      creatorId: user.id,
      creatorRole: user.role,
      role: parsed.data.role,
      name: parsed.data.name,
      email: parsed.data.email,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw error;
  }
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- api/users/route.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/users/errors.ts src/lib/users/create.ts src/lib/users/create.test.ts src/app/api/users/route.ts src/app/api/users/route.test.ts
git commit -m "feat: user creation with role-hierarchy enforcement and audit logging"
```

---

### Task 4: User listing and search/filter

**Files:**
- Create: `src/lib/users/types.ts`
- Create: `src/lib/users/list.ts`
- Test: `src/lib/users/list.test.ts`
- Modify: `src/app/api/users/route.ts` (add `GET` alongside Task 3's `POST`)
- Test: `src/app/api/users/route.test.ts` (append `GET` tests to the file Task 3 created)

**Interfaces:**
- Consumes: `pool`, `createUser` (Task 3, for test fixtures), `getCurrentUser` (`rbac.ts`), `Role`/`ROLES` (`roles.ts`).
- Produces: `UserRow` type from `src/lib/users/types.ts` (`{ id: number; role: Role; name: string; email: string; status: "ACTIVE" | "INACTIVE"; created_by: number | null; created_at: Date; updated_at: Date }`); `listUsers(pool: Pool, viewerRole: Role, filters: { role?: Role; status?: "ACTIVE" | "INACTIVE"; q?: string }): Promise<UserRow[]>` from `src/lib/users/list.ts`. `GET /api/users`. Task 8's `/team` page calls `listUsers` directly (server-side) and the `/api/users` `GET` route for client-side refetches.

- [ ] **Step 1: Write `src/lib/users/types.ts`**

```ts
import type { Role } from "../auth/roles";

export type UserRow = {
  id: number;
  role: Role;
  name: string;
  email: string;
  status: "ACTIVE" | "INACTIVE";
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
};
```

- [ ] **Step 2: Write the failing `listUsers` test**

```ts
// src/lib/users/list.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "./create";
import { listUsers } from "./list";

const superAdminEmail = `list-users-admin-${Date.now()}@example.com`;
let superAdminId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

describe("listUsers", () => {
  it("a user created by one actor is visible when listed by SUPER_ADMIN (shared workspace)", async () => {
    const email = `shared-mh-${Date.now()}@example.com`;
    createdEmails.push(email);
    const created = await createUser(pool, {
      creatorId: superAdminId,
      creatorRole: "SUPER_ADMIN",
      role: "MARKETING_HEAD",
      name: "Shared MH",
      email,
    });

    const rows = await listUsers(pool, "SUPER_ADMIN", {});
    expect(rows.some((row) => row.id === created.id)).toBe(true);
  });

  it("MARKETING_HEAD only sees PRE_SALES and SALESPERSON, never SUPER_ADMIN or MARKETING_HEAD", async () => {
    const rows = await listUsers(pool, "MARKETING_HEAD", {});
    expect(rows.every((row) => row.role === "PRE_SALES" || row.role === "SALESPERSON")).toBe(true);
  });

  it("PRE_SALES and SALESPERSON see nobody", async () => {
    expect(await listUsers(pool, "PRE_SALES", {})).toEqual([]);
    expect(await listUsers(pool, "SALESPERSON", {})).toEqual([]);
  });

  it("filters by status and a name/email search term", async () => {
    const email = `findme-${Date.now()}@example.com`;
    createdEmails.push(email);
    const created = await createUser(pool, {
      creatorId: superAdminId,
      creatorRole: "SUPER_ADMIN",
      role: "MARKETING_HEAD",
      name: "Findme Person",
      email,
    });

    const byStatus = await listUsers(pool, "SUPER_ADMIN", { status: "ACTIVE" });
    expect(byStatus.some((row) => row.id === created.id)).toBe(true);

    const byQuery = await listUsers(pool, "SUPER_ADMIN", { q: "Findme" });
    expect(byQuery.some((row) => row.id === created.id)).toBe(true);
    expect(byQuery.some((row) => row.id === superAdminId)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- list.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement `listUsers` in `src/lib/users/list.ts`**

```ts
import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import type { UserRow } from "./types";

const VISIBLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"],
  MARKETING_HEAD: ["PRE_SALES", "SALESPERSON"],
  PRE_SALES: [],
  SALESPERSON: [],
};

export async function listUsers(
  pool: Pool,
  viewerRole: Role,
  filters: { role?: Role; status?: "ACTIVE" | "INACTIVE"; q?: string },
): Promise<UserRow[]> {
  const visibleRoles = VISIBLE_ROLES[viewerRole];
  if (visibleRoles.length === 0) return [];

  const roleFilter = filters.role && visibleRoles.includes(filters.role) ? [filters.role] : visibleRoles;

  const conditions = ["role = ANY($1)"];
  const params: unknown[] = [roleFilter];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT id, role, name, email, status, created_by, created_at, updated_at
     FROM users
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );
  return rows;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- list.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing `GET` route test**

Append to `src/app/api/users/route.test.ts` (same `beforeAll`/`afterAll` fixtures as the existing `POST` tests):

```ts
import { GET } from "./route";

function getUsers(query: string, cookie?: string) {
  return GET(
    new Request(`http://localhost/api/users${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

describe("GET /api/users", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getUsers("")).status).toBe(401);
  });

  it("returns the role-scoped list for an authenticated SUPER_ADMIN", async () => {
    const res = await getUsers("", `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- api/users/route.test.ts`
Expected: FAIL (`GET` not exported)

- [ ] **Step 8: Add `GET` to `src/app/api/users/route.ts`**

```ts
import { listUsers } from "../../../lib/users/list";

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  q: z.string().trim().min(1).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    role: url.searchParams.get("role") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const users = await listUsers(pool, user.role, parsed.data);
  return NextResponse.json({ users });
}
```

(Add the two new imports — `listUsers` and `z`'s already-imported `z.enum`/`z.string` usage needs no new import — near the top of the existing file, alongside `POST`'s imports.)

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- api/users/route.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/users/types.ts src/lib/users/list.ts src/lib/users/list.test.ts src/app/api/users/route.ts src/app/api/users/route.test.ts
git commit -m "feat: role-scoped user listing with search and status filters"
```

---

### Task 5: User profile edit and activate/deactivate

**Files:**
- Modify: `src/lib/users/errors.ts` (add `UserNotFoundError`)
- Create: `src/lib/users/guard.ts`
- Create: `src/lib/users/update.ts`
- Test: `src/lib/users/update.test.ts`
- Create: `src/app/api/users/[id]/route.ts`
- Test: `src/app/api/users/[id]/route.test.ts`

**Interfaces:**
- Consumes: `canManage` (Task 1), `recordAuditLog` (Task 1), `RoleNotManageableError`/`EmailAlreadyExistsError` (Task 3), `pool`, `getCurrentUser`.
- Produces: `UserNotFoundError` (added to `src/lib/users/errors.ts`); `assertManageable(pool: Pool, actorRole: Role, targetId: number): Promise<Role>` from `src/lib/users/guard.ts` (returns the target's role on success; throws `UserNotFoundError` or `RoleNotManageableError` otherwise); `updateUserProfile(pool: Pool, input: { actorId: number; actorRole: Role; targetId: number; name?: string; email?: string }): Promise<void>` and `setUserStatus(pool: Pool, input: { actorId: number; actorRole: Role; targetId: number; status: "ACTIVE" | "INACTIVE" }): Promise<void>` from `src/lib/users/update.ts`. `PATCH /api/users/[id]`. Task 6 reuses `assertManageable`.

- [ ] **Step 1: Add `UserNotFoundError` to `src/lib/users/errors.ts`**

```ts
export class UserNotFoundError extends Error {}
```

- [ ] **Step 2: Write `src/lib/users/guard.ts`**

```ts
import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { canManage } from "../auth/roles";
import { RoleNotManageableError, UserNotFoundError } from "./errors";

/** Resolves `targetId`'s role and throws unless `actorRole` may manage it. Returns the target's role on success. */
export async function assertManageable(pool: Pool, actorRole: Role, targetId: number): Promise<Role> {
  const { rows } = await pool.query<{ role: Role }>("SELECT role FROM users WHERE id = $1", [targetId]);
  const target = rows[0];
  if (!target) {
    throw new UserNotFoundError(`No user with id ${targetId}`);
  }
  if (!canManage(actorRole, target.role)) {
    throw new RoleNotManageableError(`${actorRole} cannot manage ${target.role} accounts`);
  }
  return target.role;
}
```

- [ ] **Step 3: Write the failing `update.ts` test**

```ts
// src/lib/users/update.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "./create";
import { updateUserProfile, setUserStatus } from "./update";
import { RoleNotManageableError } from "./errors";

const superAdminEmail = `update-admin-${Date.now()}@example.com`;
let superAdminId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

async function makeMarketingHead() {
  const email = `update-target-${Date.now()}-${Math.random()}@example.com`;
  createdEmails.push(email);
  return createUser(pool, {
    creatorId: superAdminId,
    creatorRole: "SUPER_ADMIN",
    role: "MARKETING_HEAD",
    name: "Original Name",
    email,
  });
}

describe("updateUserProfile", () => {
  it("updates the name and records an audit log entry", async () => {
    const target = await makeMarketingHead();
    await updateUserProfile(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, name: "New Name" });

    const { rows } = await pool.query("SELECT name FROM users WHERE id = $1", [target.id]);
    expect(rows[0].name).toBe("New Name");

    const { rows: logs } = await pool.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.updated'", [target.id]);
    expect(logs).toHaveLength(1);
  });

  it("rejects an actor who cannot manage the target's role", async () => {
    const target = await makeMarketingHead();
    await expect(
      updateUserProfile(pool, { actorId: superAdminId, actorRole: "MARKETING_HEAD", targetId: target.id, name: "Nope" }),
    ).rejects.toThrow(RoleNotManageableError);
  });
});

describe("setUserStatus", () => {
  it("deactivates a user without deleting the row, and records an audit log entry", async () => {
    const target = await makeMarketingHead();
    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });

    const { rows } = await pool.query("SELECT id, status FROM users WHERE id = $1", [target.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("INACTIVE");

    const { rows: logs } = await pool.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.deactivated'", [target.id]);
    expect(logs).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- users/update.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 5: Implement `src/lib/users/update.ts`**

```ts
import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { recordAuditLog } from "../audit/log";
import { assertManageable } from "./guard";
import { EmailAlreadyExistsError } from "./errors";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export async function updateUserProfile(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number; name?: string; email?: string },
): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const fields: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name);
    fields.push(`name = $${params.length}`);
  }
  if (input.email !== undefined) {
    params.push(input.email);
    fields.push(`email = $${params.length}`);
  }
  if (fields.length === 0) return;

  params.push(input.targetId);
  try {
    await pool.query(`UPDATE users SET ${fields.join(", ")}, updated_at = now() WHERE id = $${params.length}`, params);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
      throw new EmailAlreadyExistsError(`${input.email} is already in use`);
    }
    throw error;
  }

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.updated",
    targetTable: "users",
    targetId: input.targetId,
    details: { name: input.name, email: input.email },
  });
}

export async function setUserStatus(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number; status: "ACTIVE" | "INACTIVE" },
): Promise<void> {
  await assertManageable(pool, input.actorRole, input.targetId);

  await pool.query(`UPDATE users SET status = $1, updated_at = now() WHERE id = $2`, [input.status, input.targetId]);

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: input.status === "ACTIVE" ? "user.activated" : "user.deactivated",
    targetTable: "users",
    targetId: input.targetId,
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- users/update.test.ts`
Expected: PASS

- [ ] **Step 7: Write the failing `PATCH` route test**

```ts
// src/app/api/users/[id]/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { createUser } from "../../../../lib/users/create";
import { PATCH } from "./route";

const superAdminEmail = `patch-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

async function makeMarketingHead() {
  const email = `patch-target-${Date.now()}-${Math.random()}@example.com`;
  createdEmails.push(email);
  return createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "Target", email });
}

function patchUser(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/users/[id]", () => {
  it("rejects an unauthenticated request", async () => {
    const target = await makeMarketingHead();
    expect((await patchUser(target.id, { status: "INACTIVE" })).status).toBe(401);
  });

  it("lets SUPER_ADMIN deactivate a MARKETING_HEAD", async () => {
    const target = await makeMarketingHead();
    const res = await patchUser(target.id, { status: "INACTIVE" }, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);

    const { rows } = await pool.query("SELECT status FROM users WHERE id = $1", [target.id]);
    expect(rows[0].status).toBe("INACTIVE");
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await patchUser(999999999, { status: "INACTIVE" }, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- api/users/\[id\]/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 9: Implement `src/app/api/users/[id]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/auth/rbac";
import { updateUserProfile, setUserStatus } from "../../../../lib/users/update";
import { RoleNotManageableError, UserNotFoundError, EmailAlreadyExistsError } from "../../../../lib/users/errors";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined || data.status !== undefined, {
    message: "No fields to update",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    if (parsed.data.name !== undefined || parsed.data.email !== undefined) {
      await updateUserProfile(pool, {
        actorId: user.id,
        actorRole: user.role,
        targetId,
        name: parsed.data.name,
        email: parsed.data.email,
      });
    }
    if (parsed.data.status !== undefined) {
      await setUserStatus(pool, { actorId: user.id, actorRole: user.role, targetId, status: parsed.data.status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw error;
  }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- api/users/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/lib/users/errors.ts src/lib/users/guard.ts src/lib/users/update.ts src/lib/users/update.test.ts "src/app/api/users/[id]/route.ts" "src/app/api/users/[id]/route.test.ts"
git commit -m "feat: user profile edit and activate/deactivate with role enforcement"
```

---

### Task 6: Secure access reset

**Files:**
- Create: `src/lib/users/resetAccess.ts`
- Test: `src/lib/users/resetAccess.test.ts`
- Create: `src/app/api/users/[id]/reset-access/route.ts`
- Test: `src/app/api/users/[id]/reset-access/route.test.ts`

**Interfaces:**
- Consumes: `assertManageable` (Task 5), `generateTempPassword`/`hashPassword` (Task 2 / existing), `recordAuditLog` (Task 1), `pool`, `getCurrentUser`.
- Produces: `resetUserAccess(pool: Pool, input: { actorId: number; actorRole: Role; targetId: number }): Promise<{ tempPassword: string }>` from `src/lib/users/resetAccess.ts`. `POST /api/users/[id]/reset-access`.

- [ ] **Step 1: Write the failing `resetUserAccess` test**

```ts
// src/lib/users/resetAccess.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { verifyPassword } from "../auth/passwords";
import { createUser } from "./create";
import { resetUserAccess } from "./resetAccess";
import { RoleNotManageableError } from "./errors";

const superAdminEmail = `reset-access-admin-${Date.now()}@example.com`;
let superAdminId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

async function makeMarketingHead() {
  const email = `reset-target-${Date.now()}-${Math.random()}@example.com`;
  createdEmails.push(email);
  return createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "Target", email });
}

describe("resetUserAccess", () => {
  it("issues a new temp password, flags must_change_password, and records an audit log entry", async () => {
    const target = await makeMarketingHead();
    const { tempPassword } = await resetUserAccess(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });

    const { rows } = await pool.query("SELECT password_hash, must_change_password FROM users WHERE id = $1", [target.id]);
    expect(rows[0].must_change_password).toBe(true);
    expect(await verifyPassword(rows[0].password_hash, tempPassword)).toBe(true);

    const { rows: logs } = await pool.query("SELECT action, details FROM audit_logs WHERE target_id = $1 AND action = 'user.access_reset'", [target.id]);
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0].details)).not.toContain(tempPassword);
  });

  it("rejects an actor who cannot manage the target's role", async () => {
    const target = await makeMarketingHead();
    await expect(
      resetUserAccess(pool, { actorId: superAdminId, actorRole: "MARKETING_HEAD", targetId: target.id }),
    ).rejects.toThrow(RoleNotManageableError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- resetAccess.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/lib/users/resetAccess.ts`**

```ts
import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { hashPassword, generateTempPassword } from "../auth/passwords";
import { recordAuditLog } from "../audit/log";
import { assertManageable } from "./guard";

export async function resetUserAccess(
  pool: Pool,
  input: { actorId: number; actorRole: Role; targetId: number },
): Promise<{ tempPassword: string }> {
  await assertManageable(pool, input.actorRole, input.targetId);

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = true, updated_at = now() WHERE id = $2`,
    [passwordHash, input.targetId],
  );

  await recordAuditLog(pool, {
    actorUserId: input.actorId,
    action: "user.access_reset",
    targetTable: "users",
    targetId: input.targetId,
  });

  return { tempPassword };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- resetAccess.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing route test**

```ts
// src/app/api/users/[id]/reset-access/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../../lib/db";
import { runMigrations } from "../../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../../lib/auth/session";
import { createUser } from "../../../../../lib/users/create";
import { POST } from "./route";

const superAdminEmail = `route-reset-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminToken: string;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
  superAdminToken = (await createSession(superAdminId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, superAdminEmail]]);
});

function resetAccess(id: number, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/users/${id}/reset-access`, {
      method: "POST",
      headers: cookie ? { cookie } : {},
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/users/[id]/reset-access", () => {
  it("rejects an unauthenticated request", async () => {
    const email = `route-reset-target-${Date.now()}@example.com`;
    createdEmails.push(email);
    const target = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "T", email });
    expect((await resetAccess(target.id)).status).toBe(401);
  });

  it("returns a fresh temp password for an authorized actor", async () => {
    const email = `route-reset-target2-${Date.now()}@example.com`;
    createdEmails.push(email);
    const target = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "T", email });

    const res = await resetAccess(target.id, `${SESSION_COOKIE_NAME}=${superAdminToken}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.tempPassword).toBe("string");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- reset-access/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 7: Implement `src/app/api/users/[id]/reset-access/route.ts`**

```ts
import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getCurrentUser } from "../../../../../lib/auth/rbac";
import { resetUserAccess } from "../../../../../lib/users/resetAccess";
import { RoleNotManageableError, UserNotFoundError } from "../../../../../lib/users/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const result = await resetUserAccess(pool, { actorId: user.id, actorRole: user.role, targetId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- reset-access/route.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/users/resetAccess.ts src/lib/users/resetAccess.test.ts "src/app/api/users/[id]/reset-access/route.ts" "src/app/api/users/[id]/reset-access/route.test.ts"
git commit -m "feat: secure access reset issuing a fresh one-time temp password"
```

---

### Task 7: Forced password-change flow

**Files:**
- Modify: `src/lib/auth/session.ts` (select `must_change_password`)
- Modify: `src/lib/auth/rbac.ts` (`AuthUser` gains `mustChangePassword`)
- Test: `src/lib/auth/session.test.ts` (extend existing tests)
- Create: `src/lib/auth/changePassword.ts`
- Test: `src/lib/auth/changePassword.test.ts`
- Create: `src/app/api/auth/change-password/route.ts`
- Test: `src/app/api/auth/change-password/route.test.ts`
- Create: `src/app/change-password/page.tsx`
- Create: `src/app/change-password/ChangePasswordForm.tsx`
- Modify: `src/app/(dashboard)/layout.tsx` (redirect to `/change-password` when required)

**Interfaces:**
- Consumes: `hashPassword` (existing), `recordAuditLog` (Task 1), `getCurrentUser`/`requireUser` (`rbac.ts`), `pool`.
- Produces: `AuthUser` now includes `mustChangePassword: boolean`; `changePassword(pool: Pool, input: { userId: number; newPassword: string }): Promise<void>` from `src/lib/auth/changePassword.ts`. `POST /api/auth/change-password`. `/change-password` page. Task 8's `(dashboard)` pages are unaffected by the `AuthUser` shape change (additive field).

- [ ] **Step 1: Modify `getSessionUser` in `src/lib/auth/session.ts`**

Add `u.must_change_password` to the `SELECT`, and extend the return type with `must_change_password: boolean`:

```ts
export async function getSessionUser(
  token: string,
): Promise<{ id: number; role: Role; name: string; email: string; status: "ACTIVE" | "INACTIVE"; must_change_password: boolean } | null> {
  const tokenHash = hashToken(token);

  const { rows } = await pool.query<{
    id: number;
    role: Role;
    name: string;
    email: string;
    status: "ACTIVE" | "INACTIVE";
    must_change_password: boolean;
  }>(
    `SELECT u.id, u.role, u.name, u.email, u.status, u.must_change_password
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'ACTIVE'`,
    [tokenHash],
  );

  return rows[0] ?? null;
}
```

- [ ] **Step 2: Add one assertion to the existing session test**

In `src/lib/auth/session.test.ts`, in the "creates a session and resolves it back to the user" test, add:

```ts
expect(user?.must_change_password).toBe(false);
```

(The seeded test user comes from `seedSuperAdmin`, whose rows default to `must_change_password = false` per Task 1's migration default.)

- [ ] **Step 3: Run the session test to confirm it still passes**

Run: `npm test -- session.test.ts`
Expected: PASS

- [ ] **Step 4: Update `AuthUser` and `getCurrentUser` in `src/lib/auth/rbac.ts`**

```ts
export type AuthUser = { id: number; role: Role; name: string; email: string; mustChangePassword: boolean };

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const user = await getSessionUser(token);
  if (!user) return null;

  return { id: user.id, role: user.role, name: user.name, email: user.email, mustChangePassword: user.must_change_password };
}
```

(`requireUser`/`requireRole` need no changes — they already just pass the `AuthUser` through.)

- [ ] **Step 5: Write the failing `changePassword` test**

```ts
// src/lib/auth/changePassword.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "./seed";
import { verifyPassword } from "./passwords";
import { changePassword } from "./changePassword";

const email = `change-password-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Change Password Test", password: "1234" })).id;
  await pool.query("UPDATE users SET must_change_password = true WHERE id = $1", [userId]);
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

describe("changePassword", () => {
  it("sets a new password hash and clears must_change_password", async () => {
    await changePassword(pool, { userId, newPassword: "a-new-strong-password" });

    const { rows } = await pool.query("SELECT password_hash, must_change_password FROM users WHERE id = $1", [userId]);
    expect(rows[0].must_change_password).toBe(false);
    expect(await verifyPassword(rows[0].password_hash, "a-new-strong-password")).toBe(true);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- changePassword.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 7: Implement `src/lib/auth/changePassword.ts`**

```ts
import type { Pool } from "pg";
import { hashPassword } from "./passwords";
import { recordAuditLog } from "../audit/log";

export async function changePassword(pool: Pool, input: { userId: number; newPassword: string }): Promise<void> {
  const passwordHash = await hashPassword(input.newPassword);

  await pool.query(
    `UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2`,
    [passwordHash, input.userId],
  );

  await recordAuditLog(pool, { actorUserId: input.userId, action: "user.password_changed", targetTable: "users", targetId: input.userId });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- changePassword.test.ts`
Expected: PASS

- [ ] **Step 9: Write the failing route test**

```ts
// src/app/api/auth/change-password/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "../../../../lib/auth/session";
import { POST } from "./route";

const email = `route-change-password-${Date.now()}@example.com`;
let userId: number;
let token: string;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Route Test", password: "1234" })).id;
  token = (await createSession(userId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

function changePasswordRequest(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/auth/change-password", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/change-password", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await changePasswordRequest({ password: "a-new-strong-password" })).status).toBe(401);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await changePasswordRequest({ password: "short" }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(400);
  });

  it("accepts a valid new password for the authenticated user", async () => {
    const res = await changePasswordRequest({ password: "a-new-strong-password" }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npm test -- change-password/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 11: Implement `src/app/api/auth/change-password/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../lib/db";
import { getCurrentUser } from "../../../../lib/auth/rbac";
import { changePassword } from "../../../../lib/auth/changePassword";

const changePasswordSchema = z.object({ password: z.string().min(8) });

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  await changePassword(pool, { userId: user.id, newPassword: parsed.data.password });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm test -- change-password/route.test.ts`
Expected: PASS

- [ ] **Step 13: Implement `src/app/change-password/ChangePasswordForm.tsx`**

Client component modeled on `src/app/login/LoginForm.tsx`'s style: `password` and `confirmPassword` fields (labelled, accessible), inline validation ("Enter a password with at least 8 characters." if either is under 8 chars before submit; "Passwords do not match." if they differ), `POST` to `/api/auth/change-password` with `{ password }` on success, `window.location.href = "/dashboard"` on success, "Something went wrong. Try again." on a non-OK response.

- [ ] **Step 14: Implement `src/app/change-password/page.tsx`**

Server component, **not** inside the `(dashboard)` route group (so it is never itself subject to the group's forced-redirect added in Step 15):

```tsx
import { requireUser } from "../../lib/auth/rbac";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function ChangePasswordPage() {
  await requireUser();

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900">Set a new password</h1>
        <p className="mb-6 text-sm text-zinc-500">You must set your own password before continuing.</p>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 15: Modify `src/app/(dashboard)/layout.tsx`**

After the existing `getCurrentUser()`/`redirect("/login")` check, add:

```ts
if (user.mustChangePassword) {
  redirect("/change-password");
}
```

(This is a UX convenience like the existing auth check, not a new security boundary — Route Handlers are unaffected and continue to work normally for a user who still must change their password, consistent with how the rest of this phase's checks are scoped.)

- [ ] **Step 16: Manual verification**

Run: `npm run dev`. Use `/api/users` (e.g. via the Super Admin's session cookie and `curl`, since Task 8's UI doesn't exist yet at this point in the task order — or just run this check after Task 8 instead, noting it here as a reminder for Task 8's own manual verification) to create a Marketing Head, then sign in as that Marketing Head with the returned temp password: confirm you land on `/change-password` instead of `/dashboard`, that submitting a new password redirects to `/dashboard`, and that visiting `/dashboard` directly afterward no longer redirects back to `/change-password`.

- [ ] **Step 17: Run the full test suite**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 18: Commit**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts src/lib/auth/rbac.ts src/lib/auth/changePassword.ts src/lib/auth/changePassword.test.ts src/app/api/auth/change-password/route.ts src/app/api/auth/change-password/route.test.ts src/app/change-password/page.tsx src/app/change-password/ChangePasswordForm.tsx "src/app/(dashboard)/layout.tsx"
git commit -m "feat: forced password-change flow for new and reset accounts"
```

---

### Task 8: Team UI — list, create, edit, activate/deactivate, reset access

**Files:**
- Modify: `src/app/(dashboard)/DashboardShell.tsx` (extract a shared `NavLinks` sub-component; Phase 1 left this as a deferred minor, and this task is where a second nav item makes it worth doing)
- Modify: `src/app/(dashboard)/layout.tsx` (add the role-filtered "Team" nav item)
- Create: `src/app/(dashboard)/team/page.tsx`
- Create: `src/app/(dashboard)/team/TeamView.tsx`
- Create: `src/app/(dashboard)/team/TeamView.test.tsx`

**Interfaces:**
- Consumes: `requireRole` (Task 2), `listUsers` (Task 4), `creatableRolesFor` (Task 1), `UserRow` (Task 4), the `/api/users`, `/api/users/[id]`, `/api/users/[id]/reset-access` routes (Tasks 3–6).
- Produces: the `/team` page. No other task builds on this one — it is the last task of this plan.

- [ ] **Step 1: Extract `NavLinks` in `src/app/(dashboard)/DashboardShell.tsx`**

Replace the two near-identical `navItems.map(...)` blocks (mobile drawer and desktop sidebar) with one local component defined in the same file:

```tsx
function NavLinks({
  navItems,
  isActive,
  navLinkClasses,
  onNavigate,
}: {
  navItems: NavItem[];
  isActive: (href: string) => boolean;
  navLinkClasses: (href: string) => string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={navLinkClasses(item.href)}
        >
          <i className={`${item.icon} text-lg`} aria-hidden="true" />
          {item.label}
        </Link>
      ))}
    </>
  );
}
```

Use `<NavLinks navItems={navItems} isActive={isActive} navLinkClasses={navLinkClasses} onNavigate={() => setMobileNavOpen(false)} />` in the mobile drawer's `<nav>`, and the same without `onNavigate` in the desktop `<nav>`. No behavior change — this is a pure extraction, verified by the existing Phase 1 manual browser check still holding (re-verify visually in Step 7 below, not with a new automated test).

- [ ] **Step 2: Add the role-filtered "Team" nav item in `src/app/(dashboard)/layout.tsx`**

```ts
const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" },
  ...(user.role === "SUPER_ADMIN" || user.role === "MARKETING_HEAD"
    ? [{ href: "/team", label: "Team", icon: "ri-team-line" }]
    : []),
];
```

(This moves `NAV_ITEMS` from a module-level constant to a value computed after `user` is known — adjust the surrounding code accordingly; the comment about "Phase 2+ plans add entries here" can be removed now that it's happened.)

- [ ] **Step 3: Write the failing `TeamView` test**

```tsx
// src/app/(dashboard)/team/TeamView.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TeamView from "./TeamView";

const sampleUsers = [
  { id: 1, role: "PRE_SALES", name: "Alice", email: "alice@example.com", status: "ACTIVE", created_by: 2, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

describe("TeamView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial user list", () => {
    render(<TeamView initialUsers={sampleUsers} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows a one-time temp password panel after creating a user", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 2, email: "new@example.com", tempPassword: "abc123XYZ789" }), { status: 201 }),
    );

    render(<TeamView initialUsers={sampleUsers} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);

    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New Person" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/abc123XYZ789/)).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });

  it("requires confirmation before deactivating a user", async () => {
    render(<TeamView initialUsers={sampleUsers} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);

    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- TeamView.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 5: Implement `src/app/(dashboard)/team/TeamView.tsx`**

Client component with props `{ initialUsers: UserRow[]; viewerRole: Role; creatableRoles: Role[] }`. State: `users` (seeded from `initialUsers`), `search`/`roleFilter`/`statusFilter` (re-fetch from `/api/users?...` on change via a debounced or on-blur/on-submit trigger — implementer's choice, keep it simple), `createModalOpen`, `editingUser`, `confirmAction` (`{ type: "activate" | "deactivate"; user: UserRow } | null`), `tempPasswordReveal` (`{ email: string; tempPassword: string } | null`).

- A table of `users`: columns Name, Email, Role, Status (badge), and row actions — "Edit", "Activate"/"Deactivate" (whichever applies), "Reset Access" — each wired to the corresponding route from Tasks 3–6.
- "New User" button opens a create form (role `<select>` limited to `creatableRoles`, name, email) that `POST`s to `/api/users`; on success, sets `tempPasswordReveal` to the response and prepends the new user to `users`.
- "Reset Access" asks for confirmation, then `POST`s to `/api/users/{id}/reset-access`; on success, sets `tempPasswordReveal` to `{ email: <the row's own email, already known client-side>, tempPassword: <from the response> }` — the reset-access response only contains `tempPassword`, not `email`.
- "Deactivate"/"Activate" shows a confirmation panel ("Are you sure you want to deactivate {name}?") before `PATCH`ing `/api/users/{id}` with `{ status }`.
- The temp-password reveal panel shows the email, the temp password in a monospace `<code>` with a "Copy" button (`navigator.clipboard.writeText`), and the text "This password will not be shown again." with a "Done" button to dismiss it.
- All error responses (403/404/409/etc.) surface as an inline message near the action that triggered them, not a native `alert()`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- TeamView.test.tsx`
Expected: PASS

- [ ] **Step 7: Implement `src/app/(dashboard)/team/page.tsx`**

```tsx
import { requireRole } from "../../../lib/auth/rbac";
import { pool } from "../../../lib/db";
import { creatableRolesFor } from "../../../lib/auth/roles";
import { listUsers } from "../../../lib/users/list";
import TeamView from "./TeamView";

export default async function TeamPage() {
  const user = await requireRole(["SUPER_ADMIN", "MARKETING_HEAD"]);
  const users = await listUsers(pool, user.role, {});

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Team</h1>
      <TeamView initialUsers={users} viewerRole={user.role} creatableRoles={[...creatableRolesFor(user.role)]} />
    </div>
  );
}
```

- [ ] **Step 8: Manual verification in the browser**

Run: `npm run dev`. Sign in as `admin`/`1234`. Confirm: the sidebar now shows "Team"; `/team` lists no Pre-sales/Salesperson rows (none exist yet) but the page loads; "New User" is limited to the "Marketing Head" role; creating one shows the temp-password panel exactly once. Sign out, sign in as the new Marketing Head with that temp password, confirm the forced `/change-password` redirect from Task 7, set a new password, land on `/dashboard`, confirm "Team" is visible and lets you create a Pre-sales and a Salesperson account. Open a second browser/incognito session as `admin` again and visit `/team`: confirm the Marketing Head account created earlier is visible (shared workspace — Acceptance Criterion #3), and that the Pre-sales/Salesperson accounts the Marketing Head just created are **not** listed for `admin` (Super Admin's `/team` view is scoped to Marketing Heads only, per this plan's listing rules) while they **are** visible if you sign in as the Marketing Head and reload `/team`.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 10: Commit**

```bash
git add "src/app/(dashboard)/DashboardShell.tsx" "src/app/(dashboard)/layout.tsx" "src/app/(dashboard)/team"
git commit -m "feat: Team page — list, create, edit, activate/deactivate, reset access"
```
