import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createService } from "@/lib/services/create";
import { PATCH } from "./route";

const adminEmail = `services-id-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminCookie: string;
let mhCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const serviceIds: number[] = [];

let myService: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `services-id-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `services-id-route-mh-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email);
  sessionUserIds.push(hr.id, mh.id, superAdminId);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[superAdminId, mh.id]]);
  superAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(superAdminId)).token}`;
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;

  myService = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Id Route Svc ${Date.now()}` });
  serviceIds.push(myService.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function patchService(id: number, body: unknown, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/services/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/services/[id]", () => {
  it("lets a Super Admin deactivate a service", async () => {
    const res = await patchService(myService.id, { status: "INACTIVE" }, superAdminCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("INACTIVE");
  });

  it("rejects a Marketing Head editing a service", async () => {
    const res = await patchService(myService.id, { status: "ACTIVE" }, mhCookie);
    expect(res.status).toBe(403);
  });

  it("404s a service id that doesn't exist", async () => {
    const res = await patchService(999999999, { status: "ACTIVE" }, superAdminCookie);
    expect(res.status).toBe(404);
  });
});
