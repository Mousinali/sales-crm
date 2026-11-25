import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createLead } from "@/lib/leads/create";
import { createSale } from "@/lib/sales/create";
import { normalizeCompanyName } from "@/lib/leads/normalize";
import { updateCompany } from "./update";
import { CompanyNotFoundError, CompanyNameTakenError, InvalidCompanyNameError } from "./errors";

const adminEmail = `companies-update-admin-${Date.now()}@example.com`;
let adminId: number;
const leadIds: number[] = [];
const saleIds: number[] = [];
const stamp = Date.now();
const nameA = `Update Co A ${stamp}`;
const nameB = `Update Co B ${stamp}`;

async function lead(companyName: string, phone: string) {
  const l = await createLead(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", companyName, phone, serviceRequirements: "x", leadSource: "OTHER", industry: "Retail", contactPerson: `Contact ${phone}` });
  leadIds.push(l.id);
  return l;
}

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM sales WHERE id = ANY($1)", [saleIds]);
  await pool.query("DELETE FROM lead_activities WHERE lead_id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [adminId]);
  await pool.query("DELETE FROM users WHERE id = $1", [adminId]);
});

describe("updateCompany", () => {
  it("rewrites company-wide fields on every lead of the company but leaves per-lead contacts alone", async () => {
    const first = await lead(nameA, "9000000001");
    const second = await lead(nameA, "9000000002");
    const key = normalizeCompanyName(nameA);

    const result = await updateCompany(pool, adminId, key, { industry: "Beauty & Personal Care", location: "Pune", website: "https://www.acme-update.com/home", pincode: null });
    expect(result).toBe(key);

    const { rows } = await pool.query("SELECT industry, location, website_domain, contact_person, phone FROM leads WHERE id = ANY($1) ORDER BY id", [[first.id, second.id]]);
    expect(rows.map((r) => r.industry)).toEqual(["Beauty & Personal Care", "Beauty & Personal Care"]);
    expect(rows.map((r) => r.location)).toEqual(["Pune", "Pune"]);
    expect(rows[0].website_domain).toBe("acme-update.com");
    expect(rows.map((r) => r.contact_person)).toEqual([`Contact 9000000001`, `Contact 9000000002`]);
    expect(rows.map((r) => r.phone)).toEqual(["9000000001", "9000000002"]);
  });

  it("renames the company on all its leads and on its sales, and returns the new key", async () => {
    const l = await lead(`Rename Me ${stamp}`, "9000000003");
    const sale = await createSale(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", leadId: l.id, budgetAmount: 500, budgetType: "ONE_TIME" });
    saleIds.push(sale.id);

    const newName = `Renamed Co ${stamp}`;
    const key = await updateCompany(pool, adminId, normalizeCompanyName(`Rename Me ${stamp}`), { companyName: newName });
    expect(key).toBe(normalizeCompanyName(newName));

    const { rows: leadRows } = await pool.query("SELECT company_name, company_name_normalized FROM leads WHERE id = $1", [l.id]);
    expect(leadRows[0]).toEqual({ company_name: newName, company_name_normalized: key });
    const { rows: saleRows } = await pool.query("SELECT company_name FROM sales WHERE id = $1", [sale.id]);
    expect(saleRows[0].company_name).toBe(newName);
  });

  it("refuses a name another company already uses, and changes nothing", async () => {
    await lead(nameB, "9000000004");
    await expect(updateCompany(pool, adminId, normalizeCompanyName(nameA), { companyName: nameB.toUpperCase(), industry: "Gaming & Esports" })).rejects.toBeInstanceOf(CompanyNameTakenError);
    const { rows } = await pool.query("SELECT industry FROM leads WHERE company_name_normalized = $1 LIMIT 1", [normalizeCompanyName(nameA)]);
    expect(rows[0].industry).toBe("Beauty & Personal Care");
  });

  it("lets only one of two simultaneous renames to the same name win", async () => {
    const names = [`Race One ${stamp}`, `Race Two ${stamp}`];
    await lead(names[0], "9000000005");
    await lead(names[1], "9000000006");
    const results = await Promise.allSettled(names.map((n) => updateCompany(pool, adminId, normalizeCompanyName(n), { companyName: `Race Same ${stamp}` })));
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  });

  it("rejects an unusable name and an unknown company", async () => {
    await expect(updateCompany(pool, adminId, normalizeCompanyName(nameA), { companyName: "!!!" })).rejects.toBeInstanceOf(InvalidCompanyNameError);
    await expect(updateCompany(pool, adminId, "nosuchcompany" + stamp, { industry: "Retail" })).rejects.toBeInstanceOf(CompanyNotFoundError);
  });

  it("records an audit entry", async () => {
    const { rows } = await pool.query("SELECT details FROM audit_logs WHERE actor_user_id = $1 AND action = 'company.updated' ORDER BY id", [adminId]);
    expect(rows.length).toBeGreaterThan(0);
    // The log names the company as people know it, and says what changed.
    expect(rows[0].details).toEqual({ name: nameA, fields: ["industry", "location", "website", "pincode"] });
    const renamed = rows.find((r) => r.details.renamedFrom);
    expect(renamed.details).toEqual({ name: `Renamed Co ${stamp}`, renamedFrom: `Rename Me ${stamp}`, fields: ["companyName"] });
  });
});
