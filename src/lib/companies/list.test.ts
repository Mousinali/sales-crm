import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { listCompaniesPage } from "./list";

const adminEmail = `companies-list-admin-${Date.now()}@example.com`;
let preSalesId: number;
const leadIds: number[] = [];
const companyName = `Acme Rollup Co ${Date.now()}`;

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mh = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "MARKETING_HEAD", name: "MH", email: `companies-list-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `companies-list-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;

  // Two leads for the same company (same name, different casing/spacing —
  // normalizeCompanyName should still fold them together), plus a second,
  // more recent lead carrying the "current" profile details.
  const first = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName, phone: "1", serviceRequirements: "x", leadSource: "OTHER", industry: "Old Industry" });
  leadIds.push(first.id);
  const second = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: `  ${companyName.toUpperCase()}  `, phone: "2", serviceRequirements: "x", leadSource: "OTHER", industry: "Current Industry" });
  leadIds.push(second.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("listCompaniesPage", () => {
  it("rolls two leads for the same company into one row, with the latest lead's profile and a count", async () => {
    const result = await listCompaniesPage(pool, { q: companyName }, { page: 1, pageSize: 20 });
    const row = result.items.find((c) => c.company_name_normalized.includes(companyName.toLowerCase().replace(/[^a-z0-9]/g, "")));
    expect(row).toBeDefined();
    expect(row!.lead_count).toBe(2);
    expect(row!.industry).toBe("Current Industry");
  });
});
