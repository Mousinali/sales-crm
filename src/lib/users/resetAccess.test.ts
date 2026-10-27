import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { verifyPassword } from "@/lib/auth/passwords";
import { createSession, getSessionUser } from "@/lib/auth/session";
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
  // createUser's and resetUserAccess's audit log rows reference superAdminId
  // as actor_user_id (FK, no cascade), so they must be deleted before the
  // users themselves or the DELETE below violates that foreign key — same
  // pattern as src/lib/users/create.test.ts. Sessions created in the
  // revocation test below reference target users the same way.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [createdEmails]);
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

  it("rejects a Pre-sales user resetting access", async () => {
    const target = await makeMarketingHead();
    await expect(
      resetUserAccess(pool, { actorId: superAdminId, actorRole: "PRE_SALES", targetId: target.id }),
    ).rejects.toThrow(RoleNotManageableError);
  });

  it("revokes a session created before the reset, so it cannot survive the reset", async () => {
    const target = await makeMarketingHead();
    const { token: preResetToken } = await createSession(target.id);
    expect(await getSessionUser(preResetToken)).not.toBeNull();

    await resetUserAccess(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });

    expect(await getSessionUser(preResetToken)).toBeNull();
  });
});
