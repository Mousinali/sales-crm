import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { listLeadServices } from "./services";
import { createService } from "@/lib/services/create";
import { LeadActionNotAllowedError } from "./errors";

const adminEmail = `create-admin-${Date.now()}@example.com`;
let preSalesId: number;
let salespersonId: number;
let superAdminId: number;
const leadIds: number[] = [];
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const adminId = superAdminId;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `create-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `create-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `create-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `create-sp-${Date.now()}@example.com` });
  preSalesId = ps.id;
  salespersonId = sp.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM lead_services WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("createLead", () => {
  it("rejects a Salesperson creating a lead", async () => {
    await expect(
      createLead(pool, { creatorId: salespersonId, creatorRole: "SALESPERSON", companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects HR creating a lead", async () => {
    await expect(
      createLead(pool, { creatorId: superAdminId, creatorRole: "HR", companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("rejects Super Admin creating a lead", async () => {
    await expect(
      createLead(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", companyName: "X", phone: "1", serviceRequirements: "y", leadSource: "OTHER" }),
    ).rejects.toThrow(LeadActionNotAllowedError);
  });

  it("defaults a Pre-sales-created lead's pre-sales owner to its creator, with PENDING_REVIEW status", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Y", phone: "2", serviceRequirements: "z", leadSource: "OTHER" });
    leadIds.push(lead.id);
    expect(lead.pre_sales_owner_id).toBe(preSalesId);
    expect(lead.status).toBe("PENDING_REVIEW");
  });

  it("accepts the extended contact-detail fields and defaults country to India", async () => {
    const lead = await createLead(pool, {
      creatorId: preSalesId,
      creatorRole: "PRE_SALES",
      companyName: "Contact Details Co",
      phone: "3",
      serviceRequirements: "z",
      leadSource: "OTHER",
      businessType: "Retail",
      address: "12 MG Road",
      state: "Karnataka",
      pincode: "560001",
      whatsappNumber: "9876543210",
      remarks: "Met at trade show",
    });
    leadIds.push(lead.id);
    expect(lead).toMatchObject({
      business_type: "Retail",
      address: "12 MG Road",
      state: "Karnataka",
      pincode: "560001",
      country: "India",
      whatsapp_number: "9876543210",
      remarks: "Met at trade show",
    });
  });

  it("lets the country be overridden", async () => {
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Overseas Co", phone: "4", serviceRequirements: "z", leadSource: "OTHER", country: "United States" });
    leadIds.push(lead.id);
    expect(lead.country).toBe("United States");
  });

  it("selects the given services", async () => {
    const svc = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Create Test Service ${Date.now()}` });
    serviceIds.push(svc.id);
    const lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Services Co", phone: "5", leadSource: "OTHER", serviceIds: [svc.id] });
    leadIds.push(lead.id);
    const selected = await listLeadServices(pool, lead.id);
    expect(selected.map((s) => s.id)).toEqual([svc.id]);
  });

  it("lets two different leads share the same email — unlike users.email, leads.email is not unique", async () => {
    const sharedEmail = `shared-contact-${Date.now()}@example.com`;
    const leadA = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Shared Email A", phone: "11", email: sharedEmail, serviceRequirements: "z", leadSource: "OTHER" });
    const leadB = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Shared Email B", phone: "22", email: sharedEmail, serviceRequirements: "z", leadSource: "OTHER" });
    leadIds.push(leadA.id, leadB.id);
    expect(leadA.email).toBe(sharedEmail);
    expect(leadB.email).toBe(sharedEmail);
  });
});
