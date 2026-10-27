import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { findPotentialDuplicates } from "./duplicates";

const adminEmail = `dup-admin-${Date.now()}@example.com`;
let preSalesId: number;
const leadIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `dup-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `dup-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `dup-ps-${Date.now()}@example.com` });
  preSalesId = ps.id;
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
});

describe("findPotentialDuplicates", () => {
  it("flags a lead sharing a normalized company name, phone, or website domain", async () => {
    const original = await createLead(pool, {
      creatorId: preSalesId,
      creatorRole: "PRE_SALES",
      companyName: "Acme Corp.",
      phone: "+1 (415) 555-0100",
      website: "https://www.acme.com",
      serviceRequirements: "CRM rollout",
      leadSource: "REFERRAL",
    });
    leadIds.push(original.id);

    const byName = await findPotentialDuplicates(pool, { companyName: "ACME CORP", phone: "999", serviceRequirements: "x" } as never);
    expect(byName.some((l) => l.id === original.id)).toBe(true);

    const byPhone = await findPotentialDuplicates(pool, { companyName: "Totally Different", phone: "1-415-555-0100" } as never);
    expect(byPhone.some((l) => l.id === original.id)).toBe(true);

    const noMatch = await findPotentialDuplicates(pool, { companyName: "Nobody Co", phone: "000" } as never);
    expect(noMatch.some((l) => l.id === original.id)).toBe(false);
  });

  it("does not cross-match unrelated leads whose company name is symbols-only (normalizes to empty)", async () => {
    const leadA = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "---", phone: "1112223333", serviceRequirements: "a", leadSource: "OTHER",
    });
    const leadB = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "...", phone: "4445556666", serviceRequirements: "b", leadSource: "OTHER",
    });
    leadIds.push(leadA.id, leadB.id);

    const result = await findPotentialDuplicates(pool, { companyName: "???", phone: "9998887777" } as never);
    expect(result.some((l) => l.id === leadA.id || l.id === leadB.id)).toBe(false);
  });

  it("does not match on a too-short phone fragment", async () => {
    const result = await findPotentialDuplicates(pool, { companyName: "Some Unrelated Name Co", phone: "99" } as never);
    expect(result).toEqual([]);
  });

  it("flags a lead sharing only the website domain", async () => {
    const original = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Domain Match Co", phone: "2223334444", website: "https://domainmatch.example", serviceRequirements: "x", leadSource: "OTHER",
    });
    leadIds.push(original.id);
    const result = await findPotentialDuplicates(pool, { companyName: "Totally Different Name", phone: "5556667777", website: "www.domainmatch.example" } as never);
    expect(result.some((l) => l.id === original.id)).toBe(true);
  });

  it("flags a lead sharing only the email", async () => {
    const original = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Email Match Co", phone: "3334445555", email: "shared@example.com", serviceRequirements: "x", leadSource: "OTHER",
    });
    leadIds.push(original.id);
    const result = await findPotentialDuplicates(pool, { companyName: "Totally Different Name", phone: "6667778888", email: "SHARED@example.com" } as never);
    expect(result.some((l) => l.id === original.id)).toBe(true);
  });

  it("does not cross-match unrelated leads sharing a placeholder website like 'N/A'", async () => {
    const leadA = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Placeholder A", phone: "1231231234", website: "N/A", serviceRequirements: "a", leadSource: "OTHER",
    });
    const leadB = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Placeholder B", phone: "3213214321", website: "n/a", serviceRequirements: "b", leadSource: "OTHER",
    });
    leadIds.push(leadA.id, leadB.id);
    const result = await findPotentialDuplicates(pool, { companyName: "Unrelated Third Name", phone: "9879876543", website: "N/A" } as never);
    expect(result.some((l) => l.id === leadA.id || l.id === leadB.id)).toBe(false);
  });

  it("matches a lead against its own unchanged values — excluding self is the caller's job, not this query's", async () => {
    const lead = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Self Match Co", phone: "1472583690", serviceRequirements: "x", leadSource: "OTHER",
    });
    leadIds.push(lead.id);
    const dup = await findPotentialDuplicates(pool, { companyName: lead.company_name, phone: lead.phone });
    expect(dup.some((l) => l.id === lead.id)).toBe(true);
  });

  it("does not treat a company name differing only by legal suffix as a duplicate (shortcut: exact-normalized-match only, not fuzzy — upgrade if the business asks for suffix-insensitive matching)", async () => {
    const lead = await createLead(pool, {
      creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Acme Inc", phone: "9638527410", serviceRequirements: "x", leadSource: "OTHER",
    });
    leadIds.push(lead.id);
    const dup = await findPotentialDuplicates(pool, { companyName: "Acme" });
    expect(dup.some((l) => l.id === lead.id)).toBe(false);
  });
});
