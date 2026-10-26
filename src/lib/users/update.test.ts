import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "./create";
import { updateUserProfile, setUserStatus } from "./update";
import { RoleNotManageableError } from "./errors";
import { createSession, getSessionUser } from "../auth/session";

const superAdminEmail = `update-admin-${Date.now()}@example.com`;
let superAdminId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: superAdminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  // updateUserProfile/setUserStatus's audit log rows reference superAdminId
  // as actor_user_id (FK, no cascade), so they must be deleted before the
  // users themselves - same pattern as create.test.ts. Sessions created in
  // the revocation test below reference target users the same way.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))", [createdEmails]);
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

  it("revokes existing sessions on deactivation, so reactivating later doesn't resurrect old logins", async () => {
    const target = await makeMarketingHead();
    const { token: preDeactivateToken } = await createSession(target.id);
    expect(await getSessionUser(preDeactivateToken)).not.toBeNull();

    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });
    expect(await getSessionUser(preDeactivateToken)).toBeNull();

    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "ACTIVE" });
    expect(await getSessionUser(preDeactivateToken)).toBeNull();
  });
});
