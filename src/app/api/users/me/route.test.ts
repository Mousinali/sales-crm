import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { PATCH } from "./route";

const email = `me-${Date.now()}@example.com`;
let userId: number;
let token: string;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Self Editor", password: "1234" })).id;
  token = (await createSession(userId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
});

function patchMe(body: unknown, cookie?: string) {
  return PATCH(
    new Request("http://localhost/api/users/me", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("PATCH /api/users/me", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await patchMe({ phone: "123" });
    expect(response.status).toBe(401);
  });

  it("rejects an empty body with no fields to update", async () => {
    const response = await patchMe({}, `${SESSION_COOKIE_NAME}=${token}`);
    expect(response.status).toBe(400);
  });

  it("saves the caller's own phone and WhatsApp number", async () => {
    const response = await patchMe(
      { phone: "555-0100", whatsappNumber: "555-0199" },
      `${SESSION_COOKIE_NAME}=${token}`,
    );
    expect(response.status).toBe(200);

    const { rows } = await pool.query<{ phone: string | null; whatsapp_number: string | null }>(
      "SELECT phone, whatsapp_number FROM users WHERE id = $1",
      [userId],
    );
    expect(rows[0]).toEqual({ phone: "555-0100", whatsapp_number: "555-0199" });
  });
});
