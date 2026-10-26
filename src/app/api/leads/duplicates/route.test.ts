import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { GET } from "./route";

const adminEmail = `leads-dup-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let preSalesCookie: string;
let salespersonCookie: string;
let hrCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `leads-dup-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `leads-dup-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `leads-dup-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `leads-dup-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[hr.id, ps.id, sp.id]]);

  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;
  hrCookie = `${SESSION_COOKIE_NAME}=${(await createSession(hr.id)).token}`;

  const lead = await createLead(pool, { creatorId: ps.id, creatorRole: "PRE_SALES", companyName: "Dup Route Co", phone: "5551234567", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function getDuplicates(query: string, cookie?: string) {
  return GET(
    new Request(`http://localhost/api/leads/duplicates${query}`, {
      headers: cookie ? { cookie } : {},
    }),
  );
}

describe("GET /api/leads/duplicates", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getDuplicates("?companyName=Dup+Route+Co&phone=5551234567")).status).toBe(401);
  });

  it("rejects a Salesperson (not a lead-creating role)", async () => {
    expect((await getDuplicates("?companyName=Dup+Route+Co&phone=5551234567", salespersonCookie)).status).toBe(403);
  });

  it("rejects HR (no lead access at all)", async () => {
    expect((await getDuplicates("?companyName=Dup+Route+Co&phone=5551234567", hrCookie)).status).toBe(403);
  });

  it("lets a Pre-sales user check for duplicates, returning only a minimal projection", async () => {
    const res = await getDuplicates("?companyName=Dup+Route+Co&phone=5551234567", preSalesCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicates[0]).toEqual({ id: leadIds[0], companyName: "Dup Route Co", status: "PENDING_REVIEW" });
    expect(body.duplicates[0]).not.toHaveProperty("service_requirements");
    expect(body.duplicates[0]).not.toHaveProperty("notes");
  });

  it("checks by company name alone, before phone has been filled in", async () => {
    const res = await getDuplicates("?companyName=Dup+Route+Co", preSalesCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicates.some((d: { id: number }) => d.id === leadIds[0])).toBe(true);
  });
});
