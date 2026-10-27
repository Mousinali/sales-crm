import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createService } from "@/lib/services/create";
import { POST, GET } from "./route";

const adminEmail = `services-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let superAdminCookie: string;
let mhCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `services-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `services-route-mh-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email);
  sessionUserIds.push(hr.id, mh.id, superAdminId);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[superAdminId, mh.id]]);
  superAdminCookie = `${SESSION_COOKIE_NAME}=${(await createSession(superAdminId)).token}`;
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;

  const inactive = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Inactive Route Svc ${Date.now()}` });
  serviceIds.push(inactive.id);
  await pool.query("UPDATE services SET status = 'INACTIVE' WHERE id = $1", [inactive.id]);
});

afterAll(async () => {
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function getServices(query: string, cookie?: string) {
  return GET(new Request(`http://localhost/api/services${query ? `?${query}` : ""}`, { headers: cookie ? { cookie } : {} }));
}

function postService(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/services", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET /api/services", () => {
  it("defaults to only active services for a non-Super-Admin", async () => {
    const res = await getServices("", mhCookie);
    const body = await res.json();
    expect(body.services.every((s: { status: string }) => s.status === "ACTIVE")).toBe(true);
  });

  it("includes inactive services for a Super Admin", async () => {
    const res = await getServices("", superAdminCookie);
    const body = await res.json();
    expect(body.services.some((s: { status: string }) => s.status === "INACTIVE")).toBe(true);
  });

  it("ignores an explicit status=INACTIVE query from a non-Super-Admin", async () => {
    const res = await getServices("status=INACTIVE", mhCookie);
    const body = await res.json();
    expect(body.services.every((s: { status: string }) => s.status === "ACTIVE")).toBe(true);
  });

  it("rejects an unauthenticated request", async () => {
    expect((await getServices("")).status).toBe(401);
  });
});

describe("POST /api/services", () => {
  it("lets a Super Admin create a service", async () => {
    const res = await postService({ name: `Route Create ${Date.now()}` }, superAdminCookie);
    expect(res.status).toBe(201);
    const body = await res.json();
    serviceIds.push(body.id);
  });

  it("rejects a Marketing Head creating a service", async () => {
    const res = await postService({ name: `Rejected ${Date.now()}` }, mhCookie);
    expect(res.status).toBe(403);
  });
});
