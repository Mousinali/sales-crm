import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { POST } from "./route";

const adminEmail = `review-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let pendingLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `review-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `review-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `review-route-ps-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email);
  sessionUserIds.push(hr.id, mh.id, ps.id);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;

  pendingLead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Review Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(pendingLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postReview(id: number, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/leads/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/leads/[id]/review", () => {
  it("400s a reject with no reason", async () => {
    const res = await postReview(pendingLead.id, { action: "REJECT" }, mhCookie);
    expect(res.status).toBe(400);
  });

  it("403s a Pre-sales user calling review", async () => {
    const res = await postReview(pendingLead.id, { action: "QUALIFY" }, preSalesCookie);
    expect(res.status).toBe(403);
  });

  it("lets Marketing Head qualify", async () => {
    const res = await postReview(pendingLead.id, { action: "QUALIFY" }, mhCookie);
    expect(res.status).toBe(200);
  });
});
