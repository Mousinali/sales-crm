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
