import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "../users/create";
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
});
