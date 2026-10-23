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
  // createUser's audit log rows reference superAdminId as actor_user_id
  // (FK, no cascade), so they must go before the users themselves.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
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
