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
