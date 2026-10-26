import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "../db";
import { runMigrations } from "../migrate";
import { seedSuperAdmin } from "../auth/seed";
import { createUser } from "../users/create";
import { createLead } from "./create";
import { listLeads } from "./list";

const adminEmail = `list-leads-admin-${Date.now()}@example.com`;
let adminId: number;
let hrId: number;
let preSalesId: number;
let unassignedSalespersonId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let leadByOtherPreSales: { id: number };
let archivedLead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `list-leads-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `list-leads-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `list-leads-ps-${Date.now()}@example.com` });
  const otherPs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Other PS", email: `list-leads-ops-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `list-leads-sp-${Date.now()}@example.com` });

  hrId = hr.id;
  preSalesId = ps.id;
  unassignedSalespersonId = sp.id;
  createdEmails.push(hr.email, mh.email, ps.email, otherPs.email, sp.email);

  const own = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Own Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadByOtherPreSales = await createLead(pool, { creatorId: otherPs.id, creatorRole: "PRE_SALES", companyName: "Findme Corp", phone: "2", serviceRequirements: "x", leadSource: "OTHER" });
  archivedLead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Archived Co", phone: "3", serviceRequirements: "x", leadSource: "OTHER" });
  await pool.query("UPDATE leads SET archived_at = now() WHERE id = $1", [archivedLead.id]);

  leadIds.push(own.id, leadByOtherPreSales.id, archivedLead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("listLeads", () => {
  it("lets SUPER_ADMIN and MARKETING_HEAD see every lead", async () => {
    const rows = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, {});
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(true);
  });

  it("scopes PRE_SALES to leads they created or own, never another Pre-sales user's", async () => {
    const rows = await listLeads(pool, { id: preSalesId, role: "PRE_SALES" }, {});
    expect(rows.every((l) => l.created_by === preSalesId || l.pre_sales_owner_id === preSalesId)).toBe(true);
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(false);
  });

  it("scopes SALESPERSON to leads assigned to them", async () => {
    expect(await listLeads(pool, { id: unassignedSalespersonId, role: "SALESPERSON" }, {})).toEqual([]);
  });

  it("excludes archived leads unless includeArchived is set", async () => {
    const withoutArchived = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, {});
    expect(withoutArchived.some((l) => l.id === archivedLead.id)).toBe(false);
    const withArchived = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { includeArchived: true });
    expect(withArchived.some((l) => l.id === archivedLead.id)).toBe(true);
  });

  it("filters by status and searches company name/phone/email", async () => {
    const byStatus = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { status: "PENDING_REVIEW" });
    expect(byStatus.every((l) => l.status === "PENDING_REVIEW")).toBe(true);
    const byQuery = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { q: "Findme" });
    expect(byQuery.some((l) => l.company_name.includes("Findme"))).toBe(true);
  });

  it("HR sees no leads", async () => {
    expect(await listLeads(pool, { id: hrId, role: "HR" }, {})).toEqual([]);
  });
});
