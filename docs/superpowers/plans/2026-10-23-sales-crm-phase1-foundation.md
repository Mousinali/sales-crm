# Sales CRM — Phase 1: Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js + PostgreSQL foundation for the internal Sales CRM: local database, raw-SQL migration workflow, Argon2id-based auth with server-managed sessions, role-based access primitives, a seeded Super Admin account (`admin` / `1234`), and an auth-gated dashboard shell.

**Architecture:** Next.js App Router (TypeScript) talks to a local PostgreSQL 17 database (`sales_crm`) exclusively through parameterized raw SQL via `pg` — no ORM. A small hand-rolled migration runner applies versioned `.sql` files from `migrations/`. Auth uses Argon2id password hashes, opaque random session tokens (SHA-256 hashed at rest) stored in a `sessions` table, and an HTTP-only/SameSite cookie. Server Components and Route Handlers are the only places that read the session or touch the database; the UI never makes authorization decisions on its own.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, PostgreSQL 17 (Homebrew, local), `pg`, `argon2`, `zod`, Tailwind CSS v4, `remixicon`, `vitest` (+ `@testing-library/react`/`jsdom` for the one UI test), `tsx` for running migration/seed scripts.

**Spec:** `req.md` (sections 2, 3, 3.5, 4.1, 12, 13, 14 cover this phase; full implementation plan outline in section 16, Phase 1)

## Global Constraints

- No ORM: Prisma, Drizzle, Sequelize, etc. are forbidden — all DB access is `pg` with `$1,$2,...` parameterized queries (req.md §2, §12).
- Passwords are hashed with Argon2id (or bcrypt); plaintext passwords are never stored or logged (req.md §13).
- Sessions use secure, HTTP-only, SameSite cookies; `secure` is enabled outside development (req.md §13).
- Every protected Server Component / Route Handler re-validates the session and the user's role server-side; the UI hiding a control is never sufficient (req.md §3.5).
- A deactivated (`status = 'INACTIVE'`) user must be rejected at login **and** have existing sessions stop working immediately (req.md §3.5, §4.2).
- All timestamps are `TIMESTAMPTZ` (req.md §12).
- Multi-table writes run inside a single PostgreSQL transaction (req.md §12) — not triggered yet in Phase 1 (no multi-table writes), but the `query`/pool helper must expose a way to run one for later phases.
- Schema changes live in versioned SQL files under `migrations/`, applied in filename order (req.md §12).
- UI is light-theme only, responsive, built with Tailwind CSS and Remix Icons (req.md §14) — strip the `dark:` classes left over from `create-next-app`.

## Review Focus

- Login with the seeded identifier `admin` (not RFC-email-shaped) must succeed — a login schema that requires `.email()` format would lock out the literal default credential the user asked for on day one.
- A user whose `status` flips to `INACTIVE` after they already have a valid session cookie must be denied on the very next request — the session lookup must re-check live user status, not just status-at-login.
- A revoked (logged-out) or expired session token presented again must be rejected by the DB query itself (`revoked_at IS NULL AND expires_at > now()`), not just by the client discarding the cookie.
- Re-running `npm run migrate` and `npm run seed:admin` against an already-initialized database must be a safe no-op (idempotent) so redeploys/restarts don't error or duplicate the Super Admin row.
- Visiting `/dashboard` directly with no cookie, or a garbage/tampered cookie value, must redirect server-side to `/login` before any protected content renders — never rely on client-side redirect alone.

---

### Task 1: Project setup, local database, and test harness

**Files:**
- Modify: `package.json`
- Create: `.env.local`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Test: `tests/setup.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `process.env.DATABASE_URL`, `process.env.SESSION_COOKIE_NAME`, `process.env.SESSION_TTL_HOURS`, `process.env.SUPER_ADMIN_EMAIL`, `process.env.SUPER_ADMIN_PASSWORD`, `process.env.SUPER_ADMIN_NAME` available to both Next.js (`.env.local` is auto-loaded) and Vitest (via `vitest.setup.ts`). `npm run test` runs Vitest once.

- [ ] **Step 1: Install dependencies**

Run: `npm install pg argon2 zod remixicon` and `npm install -D @types/pg vitest tsx dotenv @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react`

- [ ] **Step 2: Create the local database**

Run: `createdb sales_crm`
Verify: `psql -lqt | cut -d '|' -f1 | grep -qw sales_crm && echo OK`
Expected: `OK`

- [ ] **Step 3: Write `.env.local`**

```
DATABASE_URL=postgresql://skmousin@localhost:5432/sales_crm
SESSION_COOKIE_NAME=sales_crm_session
SESSION_TTL_HOURS=12
SUPER_ADMIN_EMAIL=admin
SUPER_ADMIN_PASSWORD=1234
SUPER_ADMIN_NAME=Super Admin
```

(explicit `skmousin` user, matching the local Homebrew Postgres trust-auth setup confirmed during planning — no password needed locally)

- [ ] **Step 4: Write `.env.example`**

Same keys as `.env.local`, values replaced with placeholders except `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`, which stay `admin`/`1234` since that is the documented first-run default, e.g. `DATABASE_URL=postgresql://<user>@localhost:5432/sales_crm`.

- [ ] **Step 5: Write `vitest.config.ts`**

Use `defineConfig` from `vitest/config`, `plugins: [react()]`, `test: { environment: 'node', setupFiles: ['./vitest.setup.ts'] }`, and resolve alias `@` → `./src` to match `tsconfig.json`. Individual UI test files override the environment per-file with a `// @vitest-environment jsdom` docblock (needed in Task 6).

- [ ] **Step 6: Write `vitest.setup.ts`**

```ts
import { config } from "dotenv";
config({ path: ".env.local" });
```

- [ ] **Step 7: Add `test` script to `package.json`**

`"test": "vitest run"`, plus `"migrate": "tsx scripts/migrate.ts"` and `"seed:admin": "tsx scripts/seed-super-admin.ts"` (scripts created in later tasks — safe to add the entries now).

- [ ] **Step 8: Write the smoke test**

```ts
// tests/setup.test.ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("loads env vars from .env.local", () => {
    expect(process.env.DATABASE_URL).toBe("postgresql://skmousin@localhost:5432/sales_crm");
  });
});
```

- [ ] **Step 9: Run it**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .env.example vitest.config.ts vitest.setup.ts tests/setup.test.ts
git commit -m "chore: project setup, local sales_crm database, test harness"
```

(`.env.local` must stay untracked — confirm it's covered by the existing `.gitignore` before committing.)

---

### Task 2: Database pool and migration runner

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/migrate.ts`
- Create: `scripts/migrate.ts`
- Test: `src/lib/migrate.test.ts`
- Create: `tests/fixtures/sample-migrations/0001_create_demo_table.sql`
- Create: `tests/fixtures/sample-migrations/0002_alter_demo_table.sql`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` (Task 1).
- Produces: `pool: Pool` and `query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>>` from `src/lib/db.ts`; `runMigrations(pool: Pool, migrationsDir: string): Promise<{ applied: string[] }>` from `src/lib/migrate.ts`. Later tasks import `pool`/`query` from `src/lib/db.ts` and point `runMigrations` at the real `migrations/` directory.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/migrate.test.ts
import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { pool } from "./db";
import { runMigrations } from "./migrate";

const fixtureDir = path.join(__dirname, "../../tests/fixtures/sample-migrations");

afterAll(async () => {
  await pool.query("DROP TABLE IF EXISTS demo_items");
  await pool.query("DELETE FROM schema_migrations WHERE id LIKE '0001_create_demo_table.sql' OR id LIKE '0002_alter_demo_table.sql'");
});

describe("runMigrations", () => {
  it("applies pending migrations in filename order and is idempotent on rerun", async () => {
    const first = await runMigrations(pool, fixtureDir);
    expect(first.applied).toEqual(["0001_create_demo_table.sql", "0002_alter_demo_table.sql"]);

    const second = await runMigrations(pool, fixtureDir);
    expect(second.applied).toEqual([]);

    const { rows } = await pool.query("SELECT label FROM demo_items");
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Add fixture SQL files**

`tests/fixtures/sample-migrations/0001_create_demo_table.sql`:
```sql
CREATE TABLE demo_items (id BIGSERIAL PRIMARY KEY, label TEXT NOT NULL);
```
`tests/fixtures/sample-migrations/0002_alter_demo_table.sql`:
```sql
ALTER TABLE demo_items ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- migrate.test.ts`
Expected: FAIL (`src/lib/db.ts`/`src/lib/migrate.ts` not found)

- [ ] **Step 4: Implement `src/lib/db.ts`**

Export a module-level `pool = new Pool({ connectionString: process.env.DATABASE_URL })` and `query = (text, params) => pool.query(text, params)`. One pool for the whole process (Next.js dev server reuses modules across requests).

- [ ] **Step 5: Implement `runMigrations` in `src/lib/migrate.ts`**

`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())` if it doesn't exist, then: read `*.sql` filenames from `migrationsDir` sorted ascending, for each not already present in `schema_migrations`, run the file's contents and the `INSERT INTO schema_migrations` inside one `BEGIN`/`COMMIT` transaction via a client checked out from the pool. Return the list of filenames actually applied, in order.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- migrate.test.ts`
Expected: PASS

- [ ] **Step 7: Implement the CLI entrypoint**

`scripts/migrate.ts`: import `pool` and `runMigrations`, call `runMigrations(pool, path.join(__dirname, "../migrations"))`, `console.log` the applied list, exit 0 (or exit 1 and log the error on failure), then `await pool.end()`.

- [ ] **Step 8: Create the (empty for now) real migrations directory**

Run: `mkdir -p migrations` (populated starting in Task 3).

- [ ] **Step 9: Commit**

```bash
git add src/lib/db.ts src/lib/migrate.ts src/lib/migrate.test.ts scripts/migrate.ts tests/fixtures/sample-migrations
git commit -m "feat: add pg pool and raw-SQL migration runner"
```

---

### Task 3: `users` table, password hashing, and Super Admin seed

**Files:**
- Create: `migrations/0001_create_users_table.sql`
- Create: `src/lib/auth/roles.ts`
- Create: `src/lib/auth/passwords.ts`
- Test: `src/lib/auth/passwords.test.ts`
- Create: `src/lib/auth/seed.ts`
- Test: `src/lib/auth/seed.test.ts`
- Create: `scripts/seed-super-admin.ts`

**Interfaces:**
- Consumes: `pool`/`query` (Task 2), `runMigrations` (Task 2).
- Produces: `ROLES = ["SUPER_ADMIN","MARKETING_HEAD","PRE_SALES","SALESPERSON"] as const` and `type Role` from `src/lib/auth/roles.ts`; `hashPassword(plain: string): Promise<string>` and `verifyPassword(hash: string, plain: string): Promise<boolean>` from `src/lib/auth/passwords.ts`; `seedSuperAdmin(pool: Pool, input: { email: string; name: string; password: string }): Promise<{ id: number; created: boolean }>` from `src/lib/auth/seed.ts`. Later tasks select from `users` using columns `id, role, name, email, password_hash, status, created_by, created_at, updated_at`.

- [ ] **Step 1: Write `migrations/0001_create_users_table.sql`**

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','MARKETING_HEAD','PRE_SALES','SALESPERSON')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
```

- [ ] **Step 2: Write `src/lib/auth/roles.ts`**

```ts
export const ROLES = ["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"] as const;
export type Role = typeof ROLES[number];
```

- [ ] **Step 3: Write the failing password test**

```ts
// src/lib/auth/passwords.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./passwords";

describe("passwords", () => {
  it("hashes a password and verifies the correct plaintext", async () => {
    const hash = await hashPassword("1234");
    expect(hash).not.toContain("1234");
    expect(await verifyPassword(hash, "1234")).toBe(true);
  });

  it("rejects an incorrect plaintext", async () => {
    const hash = await hashPassword("1234");
    expect(await verifyPassword(hash, "wrong")).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- passwords.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 5: Implement `src/lib/auth/passwords.ts`**

`hashPassword` calls `argon2.hash(plain, { type: argon2.argon2id })`; `verifyPassword` calls `argon2.verify(hash, plain)` and returns `false` instead of throwing on a malformed hash.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- passwords.test.ts`
Expected: PASS

- [ ] **Step 7: Write the failing seed test**

```ts
// src/lib/auth/seed.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "./seed";
import { verifyPassword } from "./passwords";

const email = `seed-test-admin-${Date.now()}@example.com`;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

afterAll(async () => {
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
});

describe("seedSuperAdmin", () => {
  it("creates a SUPER_ADMIN user with a hashed password", async () => {
    const result = await seedSuperAdmin(pool, { email, name: "Seed Admin", password: "1234" });
    expect(result.created).toBe(true);

    const { rows } = await pool.query("SELECT role, password_hash, created_by FROM users WHERE id = $1", [result.id]);
    expect(rows[0].role).toBe("SUPER_ADMIN");
    expect(rows[0].created_by).toBeNull();
    expect(await verifyPassword(rows[0].password_hash, "1234")).toBe(true);
  });

  it("is idempotent on a second call with the same email", async () => {
    const first = await seedSuperAdmin(pool, { email, name: "Seed Admin", password: "1234" });
    const second = await seedSuperAdmin(pool, { email, name: "Seed Admin", password: "1234" });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- seed.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 9: Implement `src/lib/auth/seed.ts`**

`seedSuperAdmin` hashes the password with `hashPassword`, then `INSERT INTO users (role, name, email, password_hash, status, created_by) VALUES ('SUPER_ADMIN', $1, $2, $3, 'ACTIVE', NULL) ON CONFLICT (email) DO NOTHING RETURNING id`; if no row comes back, `SELECT id FROM users WHERE email = $1` and return `{ id, created: false }`, otherwise `{ id, created: true }`.

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- seed.test.ts`
Expected: PASS

- [ ] **Step 11: Implement the CLI entrypoint**

`scripts/seed-super-admin.ts`: read `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_NAME`/`SUPER_ADMIN_PASSWORD` from `process.env` (fail fast with a clear error if any is missing), call `seedSuperAdmin(pool, {...})`, log whether it created or found the account, `await pool.end()`.

- [ ] **Step 12: Run the real migration and seed against `sales_crm`**

Run: `npm run migrate && npm run seed:admin`
Verify: `psql sales_crm -c "SELECT email, role, status FROM users WHERE email = 'admin'"`
Expected: one row, `role = SUPER_ADMIN`, `status = ACTIVE`

- [ ] **Step 13: Commit**

```bash
git add migrations/0001_create_users_table.sql src/lib/auth/roles.ts src/lib/auth/passwords.ts src/lib/auth/passwords.test.ts src/lib/auth/seed.ts src/lib/auth/seed.test.ts scripts/seed-super-admin.ts
git commit -m "feat: users table, Argon2id password hashing, Super Admin seed script"
```

---

### Task 4: `sessions` table and session module

**Files:**
- Create: `migrations/0002_create_sessions_table.sql`
- Create: `src/lib/auth/session.ts`
- Test: `src/lib/auth/session.test.ts`

**Interfaces:**
- Consumes: `pool`/`query` (Task 2), `users` table + `seedSuperAdmin` (Task 3), `ROLES`/`Role` (Task 3).
- Produces: `SESSION_COOKIE_NAME: string`, `createSession(userId: number): Promise<{ token: string; expiresAt: Date }>`, `getSessionUser(token: string): Promise<{ id: number; role: Role; name: string; email: string; status: "ACTIVE" | "INACTIVE" } | null>`, `revokeSession(token: string): Promise<void>` from `src/lib/auth/session.ts`. Later tasks (RBAC helper, login/logout routes, dashboard layout) use exactly these four exports.

- [ ] **Step 1: Write `migrations/0002_create_sessions_table.sql`**

```sql
CREATE TABLE sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/auth/session.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "./seed";
import { createSession, getSessionUser, revokeSession } from "./session";

const email = `session-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const seeded = await seedSuperAdmin(pool, { email, name: "Session Test", password: "1234" });
  userId = seeded.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

describe("session lifecycle", () => {
  it("creates a session and resolves it back to the user", async () => {
    const { token } = await createSession(userId);
    const user = await getSessionUser(token);
    expect(user?.id).toBe(userId);
  });

  it("returns null for a revoked session", async () => {
    const { token } = await createSession(userId);
    await revokeSession(token);
    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const { token } = await createSession(userId);
    await pool.query(
      "UPDATE sessions SET expires_at = now() - interval '1 hour' WHERE token_hash = encode(sha256($1::bytea), 'hex')",
      [token]
    );
    expect(await getSessionUser(token)).toBeNull();
  });

  it("returns null once the owning user is deactivated", async () => {
    const { token } = await createSession(userId);
    await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [userId]);
    expect(await getSessionUser(token)).toBeNull();
    await pool.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
  });

  it("returns null for a garbage token", async () => {
    expect(await getSessionUser("not-a-real-token")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- session.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement `src/lib/auth/session.ts`**

`SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME!`. `createSession`: generate `token = crypto.randomBytes(32).toString("base64url")`, compute `tokenHash = crypto.createHash("sha256").update(token).digest("hex")`, `expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_HOURS) * 3600_000)`, `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`, return `{ token, expiresAt }`. `getSessionUser`: hash the incoming token the same way, `SELECT u.id, u.role, u.name, u.email, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'ACTIVE'`, return the row or `null`. `revokeSession`: `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- session.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add migrations/0002_create_sessions_table.sql src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: sessions table and session create/get/revoke module"
```

---

### Task 5: RBAC helper and login/logout API routes

**Files:**
- Create: `src/lib/auth/rbac.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Test: `src/app/api/auth/login/route.test.ts`
- Test: `src/app/api/auth/logout/route.test.ts`

**Interfaces:**
- Consumes: `createSession`, `getSessionUser`, `revokeSession`, `SESSION_COOKIE_NAME` (Task 4); `query` (Task 2); `verifyPassword` (Task 3).
- Produces: `getCurrentUser(): Promise<AuthUser | null>` from `src/lib/auth/rbac.ts` (reads the cookie via `next/headers`'s `cookies()`, delegates to `getSessionUser`) — Task 6's dashboard layout and any later protected Server Component/Route Handler call this and redirect to `/login` on `null`. `POST /api/auth/login` and `POST /api/auth/logout` route handlers.

- [ ] **Step 1: Write the failing login route test**

```ts
// src/app/api/auth/login/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { POST } from "./route";

const email = `login-route-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  const seeded = await seedSuperAdmin(pool, { email, name: "Route Test", password: "1234" });
  userId = seeded.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("accepts a non-email identifier like the seeded admin login and sets a session cookie", async () => {
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(process.env.SESSION_COOKIE_NAME!);
  });

  it("rejects an incorrect password without setting a cookie", async () => {
    const res = await POST(loginRequest({ email, password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a deactivated user even with the correct password", async () => {
    await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [userId]);
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(401);
    await pool.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- login/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/lib/auth/rbac.ts`**

```ts
export type AuthUser = { id: number; role: Role; name: string; email: string };
export async function getCurrentUser(): Promise<AuthUser | null> { ... }
```

Reads the token from `(await cookies()).get(SESSION_COOKIE_NAME)?.value`; if absent, return `null`; otherwise delegate to `getSessionUser`.

- [ ] **Step 4: Implement `src/app/api/auth/login/route.ts`**

Zod schema: `z.object({ email: z.string().min(1), password: z.string().min(1) })` — deliberately **not** `.email()`, so the literal `admin` identifier validates (Review Focus item 1). On parse failure return 400. Look up the user by `SELECT id, password_hash, status FROM users WHERE email = $1`; if no row, or `status !== 'ACTIVE'`, or `verifyPassword` fails, return `NextResponse.json({ error: "Invalid credentials" }, { status: 401 })` with no cookie. On success, `createSession(user.id)` and return 200 with `cookies().set(SESSION_COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt })`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- login/route.test.ts`
Expected: PASS

- [ ] **Step 6: Write the failing logout route test**

```ts
// src/app/api/auth/logout/route.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../../../../lib/db";
import { runMigrations } from "../../../../lib/migrate";
import { seedSuperAdmin } from "../../../../lib/auth/seed";
import { createSession, getSessionUser } from "../../../../lib/auth/session";
import { POST } from "./route";

const email = `logout-route-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Logout Test", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

describe("POST /api/auth/logout", () => {
  it("revokes the session named by the cookie", async () => {
    const { token } = await createSession(userId);
    const req = new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${process.env.SESSION_COOKIE_NAME}=${token}` },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await getSessionUser(token)).toBeNull();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- logout/route.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 8: Implement `src/app/api/auth/logout/route.ts`**

Read the cookie from the incoming request, `revokeSession(token)` if present, clear the cookie (`cookies().set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" })`), return 200 regardless of whether a cookie was present.

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- logout/route.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth/rbac.ts src/app/api/auth/login/route.ts src/app/api/auth/login/route.test.ts src/app/api/auth/logout/route.ts src/app/api/auth/logout/route.test.ts
git commit -m "feat: RBAC getCurrentUser helper and login/logout API routes"
```

---

### Task 6: Login page, auth-gated dashboard shell, and root redirect

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/LoginForm.tsx`
- Test: `src/app/login/LoginForm.test.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/dashboard/page.tsx`
- Create: `src/app/(dashboard)/SignOutButton.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getCurrentUser` (Task 5), `POST /api/auth/login` / `POST /api/auth/logout` (Task 5).
- Produces: the `/login` and `/dashboard` routes later phases extend; the sidebar item list in `src/app/(dashboard)/layout.tsx` is where Phase 2+ plans add new nav entries (Team, Leads, etc.) as those pages land — Phase 1 ships only the "Dashboard" item plus sign-out.

- [ ] **Step 1: Write the failing LoginForm test**

```tsx
// src/app/login/LoginForm.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginForm from "./LoginForm";

describe("LoginForm", () => {
  it("shows an inline error when submitted empty", async () => {
    render(<LoginForm />);
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/enter your email and password/i)).toBeInTheDocument();
  });

  it("submits the entered credentials to /api/auth/login", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({ method: "POST" })
    ));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LoginForm.test.tsx`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/app/login/LoginForm.tsx`**

Client component with controlled `email`/`password` inputs (labelled, `htmlFor`/`id` matched for accessibility per req.md §14), a submit handler that: shows "Enter your email and password." inline if either field is empty (no fetch call in that case); otherwise `fetch("/api/auth/login", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email, password }) })`, and on a non-OK response shows "Invalid credentials." inline; on success, `window.location.href = "/dashboard"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LoginForm.test.tsx`
Expected: PASS

- [ ] **Step 5: Implement `src/app/login/page.tsx`**

Server component: if `getCurrentUser()` already resolves, `redirect("/dashboard")`; otherwise render a centered light-theme card with the Sales CRM title and `<LoginForm />`.

- [ ] **Step 6: Implement `src/app/(dashboard)/layout.tsx`**

Server component: `const user = await getCurrentUser(); if (!user) redirect("/login");`. Render a responsive shell: a desktop sidebar (`ri-dashboard-line` icon + "Dashboard" link, active state for `/dashboard`) and a mobile top bar that collapses the sidebar behind a toggle; a top-right area showing `user.name` / `user.role` and `<SignOutButton />`. `{children}` renders in the main content area.

- [ ] **Step 7: Implement `src/app/(dashboard)/SignOutButton.tsx`**

Client component: `onClick` calls `fetch("/api/auth/logout", { method: "POST" })` then `window.location.href = "/login"`.

- [ ] **Step 8: Implement `src/app/(dashboard)/dashboard/page.tsx`**

Server component rendering `Welcome, {user.name} ({user.role}).` using `getCurrentUser()` (the layout already guarantees a non-null user, so this reads the same call for its own copy — no new auth logic here, no `null` branch needed since the layout already redirected).

- [ ] **Step 9: Update `src/app/page.tsx`**

Server component: `const user = await getCurrentUser(); redirect(user ? "/dashboard" : "/login");` — drop the default `create-next-app` marketing content.

- [ ] **Step 10: Update `src/app/layout.tsx` and `src/app/globals.css`**

Remove `dark:` variants (light theme only per req.md §14) and add `import "remixicon/fonts/remixicon.css";` to `globals.css`. Update `metadata.title`/`description` to "Sales CRM".

- [ ] **Step 11: Manual verification in the browser**

Run: `npm run dev`, open `http://localhost:3000`.
Confirm: redirected to `/login`; signing in with `admin` / `1234` redirects to `/dashboard` and shows "Welcome, Super Admin (SUPER_ADMIN)"; visiting `/dashboard` in a fresh private window with no cookie redirects to `/login`; clicking "Sign out" returns to `/login` and a subsequent visit to `/dashboard` redirects again instead of showing cached content.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: all tests PASS

- [ ] **Step 13: Commit**

```bash
git add src/app
git commit -m "feat: login page and auth-gated dashboard shell"
```
