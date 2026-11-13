import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "./create";
import { updateUserProfile, setUserStatus, archiveUser, restoreUser } from "./update";
import { RoleNotManageableError, UserActionNotAllowedError } from "./errors";
import { listUsers } from "./list";
import { createSession, getSessionUser } from "@/lib/auth/session";

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

  it("rejects a Salesperson updating any user", async () => {
    const target = await makeMarketingHead();
    await expect(
      updateUserProfile(pool, { actorId: superAdminId, actorRole: "SALESPERSON", targetId: target.id, name: "Nope" }),
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

  it("rejects a Pre-sales user activating or deactivating any user", async () => {
    const target = await makeMarketingHead();
    await expect(
      setUserStatus(pool, { actorId: superAdminId, actorRole: "PRE_SALES", targetId: target.id, status: "INACTIVE" }),
    ).rejects.toThrow(RoleNotManageableError);
  });
});

describe("archiveUser", () => {
  it("refuses to delete a still-active account", async () => {
    const target = await makeMarketingHead();
    await expect(archiveUser(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id })).rejects.toThrow(
      UserActionNotAllowedError,
    );
  });

  it("archives a deactivated account, revokes its sessions, records an audit log entry, and hides it from listUsers", async () => {
    const target = await makeMarketingHead();
    const { token } = await createSession(target.id);
    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });

    await archiveUser(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });

    const { rows } = await pool.query<{ archived_at: Date | null }>("SELECT archived_at FROM users WHERE id = $1", [target.id]);
    expect(rows[0].archived_at).not.toBeNull();
    expect(await getSessionUser(token)).toBeNull();

    const { rows: logs } = await pool.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.archived'", [target.id]);
    expect(logs).toHaveLength(1);

    const visible = await listUsers(pool, "SUPER_ADMIN", {});
    expect(visible.some((u) => u.id === target.id)).toBe(false);
  });

  it("rejects a Pre-sales user deleting any account", async () => {
    const target = await makeMarketingHead();
    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });
    await expect(archiveUser(pool, { actorId: superAdminId, actorRole: "PRE_SALES", targetId: target.id })).rejects.toThrow(
      RoleNotManageableError,
    );
  });
});

describe("restoreUser", () => {
  it("clears archived_at, records an audit log entry, and brings it back into listUsers", async () => {
    const target = await makeMarketingHead();
    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });
    await archiveUser(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });

    await restoreUser(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });

    const { rows } = await pool.query<{ archived_at: Date | null }>("SELECT archived_at FROM users WHERE id = $1", [target.id]);
    expect(rows[0].archived_at).toBeNull();

    const { rows: logs } = await pool.query("SELECT action FROM audit_logs WHERE target_id = $1 AND action = 'user.restored'", [target.id]);
    expect(logs).toHaveLength(1);

    const visible = await listUsers(pool, "SUPER_ADMIN", {});
    expect(visible.some((u) => u.id === target.id)).toBe(true);
  });

  it("rejects a Pre-sales user restoring any account", async () => {
    const target = await makeMarketingHead();
    await setUserStatus(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id, status: "INACTIVE" });
    await archiveUser(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", targetId: target.id });
    await expect(restoreUser(pool, { actorId: superAdminId, actorRole: "PRE_SALES", targetId: target.id })).rejects.toThrow(
      RoleNotManageableError,
    );
  });
});
