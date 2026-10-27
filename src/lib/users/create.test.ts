import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { verifyPassword } from "@/lib/auth/passwords";
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
  // createUser's audit log rows reference superAdminId as actor_user_id (FK,
  // no cascade), so they must be deleted before the users themselves or the
  // DELETE below violates that foreign key — same pattern as audit/log.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
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

  it("rejects a Pre-sales user creating any account", async () => {
    await expect(
      createUser(pool, {
        creatorId: superAdminId,
        creatorRole: "PRE_SALES",
        role: "SALESPERSON",
        name: "Should Fail",
        email: `pre-sales-create-fail-${Date.now()}@example.com`,
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
