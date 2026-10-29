import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { listLeads, listLeadsPage } from "./list";

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

  const pageFixtureA = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "list-leads-page-fixture A", phone: "4", serviceRequirements: "x", leadSource: "OTHER" });
  const pageFixtureB = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "list-leads-page-fixture B", phone: "5", serviceRequirements: "x", leadSource: "OTHER" });

  leadIds.push(own.id, leadByOtherPreSales.id, archivedLead.id, pageFixtureA.id, pageFixtureB.id);
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

  it("filters by dateFrom alone, excluding leads created before it, without requiring dateTo too", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    const rows = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { dateFrom: tomorrow });
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(false);
  });

  it("includes leads created on the dateTo day itself, not just before midnight", async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const rows = await listLeads(pool, { id: adminId, role: "SUPER_ADMIN" }, { dateFrom: yesterday, dateTo: todayMidnight });
    expect(rows.some((l) => l.id === leadByOtherPreSales.id)).toBe(true);
  });
});

describe("listLeadsPage", () => {
  // Scoped to this test file's own two leads via `q`, rather than the
  // unscoped SUPER_ADMIN "every lead in the database" view: that view is
  // shared with every other test file running concurrently, so comparing
  // two separate queries against it (an "all" snapshot, then a page) races
  // against other files creating/deleting their own leads in between.
  const q = "list-leads-page-fixture";

  it("returns one page of rows alongside the full match count, not the count of just that page", async () => {
    const page1 = await listLeadsPage(pool, { id: adminId, role: "SUPER_ADMIN" }, { q }, { page: 1, pageSize: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.totalPages).toBe(2);
  });

  it("offsets to the next page, returning the other matching row", async () => {
    const page1 = await listLeadsPage(pool, { id: adminId, role: "SUPER_ADMIN" }, { q }, { page: 1, pageSize: 1 });
    const page2 = await listLeadsPage(pool, { id: adminId, role: "SUPER_ADMIN" }, { q }, { page: 2, pageSize: 1 });
    expect(page2.items[0]?.id).not.toBe(page1.items[0]?.id);
  });

  it("still returns an empty, zero-total page for HR rather than erroring", async () => {
    const result = await listLeadsPage(pool, { id: hrId, role: "HR" }, {}, { page: 1, pageSize: 20 });
    expect(result).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
  });
});
