import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { setLeadServices, listLeadServices } from "./services";
import { createService } from "@/lib/services/create";

const adminEmail = `lead-services-admin-${Date.now()}@example.com`;
let preSalesId: number;
let superAdminId: number;
const leadIds: number[] = [];
const serviceIds: number[] = [];

let lead: { id: number };
let serviceA: { id: number; name: string };
let serviceB: { id: number; name: string };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `lead-services-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `lead-services-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `lead-services-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;

  serviceA = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Service A ${Date.now()}` });
  serviceB = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Service B ${Date.now()}` });
  serviceIds.push(serviceA.id, serviceB.id);

  lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Lead Services Co", phone: "1", leadSource: "OTHER" });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_services WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email IN ($1, $2, $3, $4))",
    [adminEmail, `lead-services-hr-${Date.now()}@example.com`, `lead-services-mh-${Date.now()}@example.com`, `lead-services-ps-${Date.now()}@example.com`],
  );
});

describe("setLeadServices / listLeadServices", () => {
  it("sets and lists a lead's selected services", async () => {
    await setLeadServices(pool, { leadId: lead.id, serviceIds: [serviceA.id, serviceB.id] });
    const services = await listLeadServices(pool, lead.id);
    expect(services.map((s) => s.id).sort()).toEqual([serviceA.id, serviceB.id].sort());
  });

  it("replaces the previous selection rather than accumulating", async () => {
    await setLeadServices(pool, { leadId: lead.id, serviceIds: [serviceA.id] });
    const services = await listLeadServices(pool, lead.id);
    expect(services.map((s) => s.id)).toEqual([serviceA.id]);
  });

  it("clears all services when given an empty array", async () => {
    await setLeadServices(pool, { leadId: lead.id, serviceIds: [] });
    expect(await listLeadServices(pool, lead.id)).toEqual([]);
  });
});
