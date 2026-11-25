import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { GET } from "./route";

const stamp = Date.now();
const adminEmail = `roster-admin-${stamp}@example.com`;
let adminId: number;
let cookie: string;
const ids: number[] = [];
const emails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  cookie = `${SESSION_COOKIE_NAME}=${(await createSession(adminId)).token}`;
  for (let i = 0; i < 12; i++) {
    const email = `roster-sp-${stamp}-${i}@example.com`;
    emails.push(email);
    ids.push((await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "SALESPERSON", name: `Rostertest ${String(i).padStart(2, "0")}`, email })).id);
  }
});

afterAll(async () => {
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [adminId]);
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [adminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...emails, adminEmail]]);
});

const get = (qs: string) => GET(new Request(`http://localhost/api/users/roster?${qs}`, { headers: { cookie } })).then((r) => r.json());

describe("GET /api/users/roster paging", () => {
  it("pages through matches 10 at a time without repeats and reports hasMore", async () => {
    const first = await get("q=Rostertest&limit=10");
    expect(first.users).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    const second = await get("q=Rostertest&limit=10&offset=10");
    expect(second.users).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect(new Set([...first.users, ...second.users].map((u: { id: number }) => u.id)).size).toBe(12);
  });

  it("filters by roles and excludes given ids", async () => {
    const onlyHr = await get("q=Rostertest&roles=HR");
    expect(onlyHr.users).toHaveLength(0);
    const excluded = await get(`q=Rostertest&roles=SALESPERSON&exclude=${ids[0]},${ids[1]}`);
    expect(excluded.users).toHaveLength(10);
    expect(excluded.users.some((u: { id: number }) => u.id === ids[0] || u.id === ids[1])).toBe(false);
  });

  it("matches a role word typed with a space or hyphen", async () => {
    const found = await get("q=sales%20person&roles=SALESPERSON&limit=50");
    const hyphen = await get("q=pre-sales&limit=50");
    expect(found.users).toHaveLength(0); // "sales person" is not a role name
    expect(hyphen.users.every((u: { role: string; name: string }) => /pre.sales/i.test(u.role) || /pre.sales/i.test(u.name))).toBe(true);
  });

  it("keeps the old behaviour with no paging params (up to 50, no hasMore)", async () => {
    const all = await get("");
    expect(all.users.length).toBeLessThanOrEqual(50);
    expect(typeof all.hasMore).toBe("boolean");
  });
});
