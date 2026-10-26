import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
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
  // changePassword's audit log row references userId as actor_user_id (FK,
  // no cascade), so it must be deleted before the user itself or the DELETE
  // below violates that foreign key — same pattern as
  // src/lib/users/create.test.ts / resetAccess.test.ts.
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [userId]);
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
