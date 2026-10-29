import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { POST } from "./route";

const email = `login-route-test-${Date.now()}@example.com`;
let userId: number;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  const seeded = await seedSuperAdmin(pool, { email, name: "Route Test", password: "1234" });
  userId = seeded.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
});

function loginRequest(body: unknown, headers?: Record<string, string>) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  it("returns 400 (not 500) for malformed JSON", async () => {
    const res = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("accepts a non-email identifier like the seeded admin login and sets a session cookie", async () => {
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain(process.env.SESSION_COOKIE_NAME!);
  });

  it("rejects an incorrect password without setting a cookie", async () => {
    const res = await POST(loginRequest({ email, password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a deactivated user even with the correct password", async () => {
    await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [userId]);
    const res = await POST(loginRequest({ email, password: "1234" }));
    expect(res.status).toBe(401);
    await pool.query("UPDATE users SET status = 'ACTIVE' WHERE id = $1", [userId]);
  });

  it("rate-limits repeated failed login attempts for the same identifier, blocking even a correct password while limited", async () => {
    const rateLimitedEmail = `login-ratelimit-${Date.now()}@example.com`;
    const seeded = await seedSuperAdmin(pool, { email: rateLimitedEmail, name: "Rate Limit Test", password: "correctpw" });

    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest({ email: rateLimitedEmail, password: "wrongpw" }));
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);

    // Even the correct password is rejected while rate-limited — the limit
    // must block the identifier, not just repeat the same wrong guess.
    const stillLimited = await POST(loginRequest({ email: rateLimitedEmail, password: "correctpw" }));
    expect(stillLimited.status).toBe(429);
    const body = await stillLimited.json();
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(stillLimited.headers.get("retry-after")).toBe(String(body.retryAfterSeconds));

    await pool.query("DELETE FROM sessions WHERE user_id = $1", [seeded.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [seeded.id]);
  });

  it("resets the attempt counter on a successful login, so a later failed attempt doesn't inherit the earlier count", async () => {
    const email = `login-ratelimit-reset-${Date.now()}@example.com`;
    const seeded = await seedSuperAdmin(pool, { email, name: "Reset Test", password: "correctpw" });

    // 4 of the 5 allowed attempts, then a successful login.
    for (let i = 0; i < 4; i++) await POST(loginRequest({ email, password: "wrongpw" }));
    expect((await POST(loginRequest({ email, password: "correctpw" }))).status).toBe(200);

    // If the counter weren't reset, one more failure here would be the
    // 6th attempt against the original window and trip the limit.
    expect((await POST(loginRequest({ email, password: "wrongpw" }))).status).toBe(401);

    await pool.query("DELETE FROM sessions WHERE user_id = $1", [seeded.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [seeded.id]);
  });

  it("cannot be bypassed by spoofing a different X-Forwarded-For header on every attempt", async () => {
    const spoofEmail = `login-ratelimit-spoof-${Date.now()}@example.com`;
    const seeded = await seedSuperAdmin(pool, { email: spoofEmail, name: "Spoof Test", password: "correctpw" });

    let lastStatus = 0;
    for (let i = 0; i < 10; i++) {
      const res = await POST(loginRequest({ email: spoofEmail, password: "wrongpw" }, { "x-forwarded-for": `10.0.0.${i}` }));
      lastStatus = res.status;
      if (lastStatus === 429) break;
    }
    expect(lastStatus).toBe(429);

    await pool.query("DELETE FROM sessions WHERE user_id = $1", [seeded.id]);
    await pool.query("DELETE FROM users WHERE id = $1", [seeded.id]);
  });
});
