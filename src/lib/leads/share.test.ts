import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "./create";
import { listLeads } from "./list";
import { bulkShareLeads, listLeadShares, shareLead, unshareLead } from "./share";
import { LeadActionNotAllowedError, LeadNotAccessibleError } from "./errors";

const adminEmail = `share-admin-${Date.now()}@example.com`;
let superAdminId: number;
let ownerId: number;
let viewerId: number;
let strangerId: number;
let accountantId: number;
const createdEmails: string[] = [];
let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mk = async (role: "PRE_SALES" | "SALESPERSON" | "ACCOUNTANT", tag: string) => {
    const u = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role, name: tag, email: `share-${tag}-${Date.now()}@example.com` });
    createdEmails.push(u.email);
    return u.id;
  };
  ownerId = await mk("PRE_SALES", "owner");
  viewerId = await mk("SALESPERSON", "viewer");
  strangerId = await mk("PRE_SALES", "stranger");
  accountantId = await mk("ACCOUNTANT", "acc");
  lead = await createLead(pool, { creatorId: ownerId, creatorRole: "PRE_SALES", companyName: "Share Co", phone: "1", leadSource: "OTHER" });
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE lead_id = $1", [lead.id]);
  await pool.query("DELETE FROM lead_shares WHERE lead_id = $1", [lead.id]);
  await pool.query("DELETE FROM leads WHERE id = $1", [lead.id]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY(SELECT id FROM users WHERE email = ANY($1)) OR actor_user_id = $2", [[...createdEmails, adminEmail], superAdminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

const ids = async (viewer: { id: number; role: "PRE_SALES" | "SALESPERSON" | "SUPER_ADMIN" | "ACCOUNTANT" }) => (await listLeads(pool, viewer, {})).map((l) => l.id);

describe("lead sharing", () => {
  it("shows a lead only to its owner and a Super Admin until it's shared", async () => {
    expect(await ids({ id: ownerId, role: "PRE_SALES" })).toContain(lead.id);
    expect(await ids({ id: superAdminId, role: "SUPER_ADMIN" })).toContain(lead.id);
    expect(await ids({ id: viewerId, role: "SALESPERSON" })).not.toContain(lead.id);
    expect(await ids({ id: strangerId, role: "PRE_SALES" })).not.toContain(lead.id);
  });

  it("lets the owner share it, after which that user (only) sees it", async () => {
    await shareLead(pool, { id: ownerId, role: "PRE_SALES" }, lead.id, viewerId);
    expect(await ids({ id: viewerId, role: "SALESPERSON" })).toContain(lead.id);
    expect(await ids({ id: strangerId, role: "PRE_SALES" })).not.toContain(lead.id);
    expect((await listLeadShares(pool, { id: ownerId, role: "PRE_SALES" }, lead.id)).map((s) => s.user_id)).toEqual([viewerId]);
  });

  it("won't let a shared viewer re-share or see the share list", async () => {
    await expect(shareLead(pool, { id: viewerId, role: "SALESPERSON" }, lead.id, strangerId)).rejects.toThrow(LeadNotAccessibleError);
    await expect(listLeadShares(pool, { id: viewerId, role: "SALESPERSON" }, lead.id)).rejects.toThrow(LeadNotAccessibleError);
  });

  it("refuses to share with an Accountant", async () => {
    await expect(shareLead(pool, { id: ownerId, role: "PRE_SALES" }, lead.id, accountantId)).rejects.toThrow(LeadActionNotAllowedError);
    expect(await ids({ id: accountantId, role: "ACCOUNTANT" })).toEqual([]);
  });

  it("stops showing the lead once unshared", async () => {
    await unshareLead(pool, { id: ownerId, role: "PRE_SALES" }, lead.id, viewerId);
    expect(await ids({ id: viewerId, role: "SALESPERSON" })).not.toContain(lead.id);
  });

  it("bulk-shares several leads with several people, but only leads the actor owns", async () => {
    const second = await createLead(pool, { creatorId: ownerId, creatorRole: "PRE_SALES", companyName: "Share Co 2", phone: "2", leadSource: "OTHER" });
    const foreign = await createLead(pool, { creatorId: strangerId, creatorRole: "PRE_SALES", companyName: "Share Co 3", phone: "3", leadSource: "OTHER" });
    try {
      const owner = { id: ownerId, role: "PRE_SALES" as const };
      await expect(bulkShareLeads(pool, owner, [lead.id, foreign.id], [viewerId])).rejects.toThrow(LeadNotAccessibleError);
      await expect(bulkShareLeads(pool, owner, [lead.id], [accountantId])).rejects.toThrow(LeadActionNotAllowedError);

      expect(await bulkShareLeads(pool, owner, [lead.id, second.id], [viewerId, strangerId])).toEqual({ leads: 2, users: 2 });
      expect(await ids({ id: viewerId, role: "SALESPERSON" })).toEqual(expect.arrayContaining([lead.id, second.id]));
      expect(await ids({ id: strangerId, role: "PRE_SALES" })).toContain(second.id);
    } finally {
      await pool.query("DELETE FROM lead_shares WHERE lead_id = ANY($1)", [[second.id, foreign.id]]);
      await pool.query("DELETE FROM leads WHERE id = ANY($1)", [[second.id, foreign.id]]);
    }
  });
});
