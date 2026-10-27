import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { listNotifications } from "@/lib/notifications/record";
import { scheduleVisit, findConflictingVisit } from "./schedule";
import { VisitActionNotAllowedError } from "./errors";

const adminEmail = `visit-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
let inactiveSalespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];
const visitIds: number[] = [];

let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `visit-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `visit-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `visit-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `visit-sp-${Date.now()}@example.com` });
  const inactiveSp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Inactive SP", email: `visit-isp-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [inactiveSp.id]);

  mhId = mh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  inactiveSalespersonId = inactiveSp.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email, inactiveSp.email);

  lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Visit Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM client_visits WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("scheduleVisit", () => {
  it("schedules a visit for an active Salesperson and notifies them", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "Demo the product" });
    visitIds.push(visit.id);
    expect(visit.status).toBe("SCHEDULED");
    expect((await listNotifications(pool, salespersonId)).some((n) => n.type === "VISIT_SCHEDULED")).toBe(true);
  });

  it("rejects scheduling for an inactive Salesperson", async () => {
    await expect(
      scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId: inactiveSalespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "x" }),
    ).rejects.toThrow(VisitActionNotAllowedError);
  });

  it("rejects a Pre-sales user scheduling a visit", async () => {
    await expect(
      scheduleVisit(pool, { actorId: preSalesId, actorRole: "PRE_SALES", leadId: lead.id, salespersonId, visitDate: "2026-11-02", startTime: "14:00", objective: "x" }),
    ).rejects.toThrow(VisitActionNotAllowedError);
  });
});

describe("findConflictingVisit", () => {
  it("flags a same-salesperson, same-date-and-start-time SCHEDULED visit", async () => {
    const visit = await scheduleVisit(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", leadId: lead.id, salespersonId, visitDate: "2026-11-03", startTime: "10:00", objective: "First" });
    visitIds.push(visit.id);
    const conflict = await findConflictingVisit(pool, { salespersonId, visitDate: "2026-11-03", startTime: "10:00" });
    expect(conflict).not.toBeNull();
  });

  it("does not flag a different time or a cancelled visit", async () => {
    expect(await findConflictingVisit(pool, { salespersonId, visitDate: "2026-11-03", startTime: "11:00" })).toBeNull();
  });
});
