import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { POST } from "./route";

const adminEmail = `transfer-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let otherSalespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `transfer-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `transfer-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `transfer-route-ps-${Date.now()}@example.com` });
  const otherSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other SP", email: `transfer-route-osp-${Date.now()}@example.com` });

  createdEmails.push(hr.email, mh.email, ps.email, otherSp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, otherSp.id);
  otherSalespersonId = otherSp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;

  lead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Transfer Route Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_transfer_history WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postTransfer(id: number, body: unknown, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/leads/${id}/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/leads/[id]/transfer", () => {
  it("rejects a transfer with no reason with 400", async () => {
    const res = await postTransfer(lead.id, { newSalespersonOwnerId: otherSalespersonId, reason: "" }, mhCookie);
    expect(res.status).toBe(400);
  });

  it("transfers the lead when a reason is given", async () => {
    const res = await postTransfer(lead.id, { newSalespersonOwnerId: otherSalespersonId, reason: "Realignment" }, mhCookie);
    expect(res.status).toBe(200);
  });

  it("rejects a Pre-sales user calling transfer", async () => {
    const res = await postTransfer(lead.id, { newSalespersonOwnerId: otherSalespersonId, reason: "x" }, preSalesCookie);
    expect(res.status).toBe(403);
  });
});
