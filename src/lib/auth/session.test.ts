import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
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
    expect(user?.must_change_password).toBe(false);
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
