import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { PATCH } from "./route";

const email = `avatar-${Date.now()}@example.com`;
let userId: number;
let token: string;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  userId = (await seedSuperAdmin(pool, { email, name: "Avatar Owner", password: "1234" })).id;
  token = (await createSession(userId)).token;
});

afterAll(async () => {
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE email = $1", [email]);
});

function patchAvatar(body: unknown, cookie?: string) {
  return PATCH(
    new Request("http://localhost/api/users/me/avatar", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("PATCH /api/users/me/avatar", () => {
  it("rejects an unauthenticated request", async () => {
    const response = await patchAvatar({ avatarUrl: "data:image/jpeg;base64,abc" });
    expect(response.status).toBe(401);
  });

  it("rejects a value that isn't an image data URL", async () => {
    const response = await patchAvatar(
      { avatarUrl: "not-a-data-url" },
      `${SESSION_COOKIE_NAME}=${token}`,
    );
    expect(response.status).toBe(400);
  });

  it("rejects an oversized data URL", async () => {
    const huge = `data:image/jpeg;base64,${"a".repeat(400_001)}`;
    const response = await patchAvatar({ avatarUrl: huge }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(response.status).toBe(400);
  });

  it("saves a well-formed image data URL and lets it be cleared with null", async () => {
    const dataUrl = "data:image/jpeg;base64,abc123";
    const saved = await patchAvatar({ avatarUrl: dataUrl }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(saved.status).toBe(200);

    const { rows: afterSave } = await pool.query<{ avatar_url: string | null }>(
      "SELECT avatar_url FROM users WHERE id = $1",
      [userId],
    );
    expect(afterSave[0].avatar_url).toBe(dataUrl);

    const cleared = await patchAvatar({ avatarUrl: null }, `${SESSION_COOKIE_NAME}=${token}`);
    expect(cleared.status).toBe(200);

    const { rows: afterClear } = await pool.query<{ avatar_url: string | null }>(
      "SELECT avatar_url FROM users WHERE id = $1",
      [userId],
    );
    expect(afterClear[0].avatar_url).toBeNull();
  });
});
