import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { recordNotification, listNotifications, markNotificationRead } from "./record";

const adminEmail = `notif-admin-${Date.now()}@example.com`;
let preSalesId: number;
let salespersonId: number;
let otherUserId: number;
const createdEmails: string[] = [];
const leadIds: number[] = [];

let lead: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `notif-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `notif-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `notif-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `notif-sp-${Date.now()}@example.com` });
  const other = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other", email: `notif-other-${Date.now()}@example.com` });

  preSalesId = ps.id;
  salespersonId = sp.id;
  otherUserId = other.id;
  createdEmails.push(hr.email, mh.email, ps.email, sp.email, other.email);

  lead = await createLead(pool, { creatorId: preSalesId, creatorRole: "PRE_SALES", companyName: "Notif Co", phone: "1", serviceRequirements: "x", leadSource: "OTHER" });
  leadIds.push(lead.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE recipient_user_id = ANY($1)", [[salespersonId, otherUserId]]);
  await pool.query("DELETE FROM leads WHERE id = ANY($1)", [leadIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("notifications", () => {
  it("records and lists a recipient's notifications, newest first, with read filtering", async () => {
    await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "You were assigned Acme Corp" });
    const all = await listNotifications(pool, salespersonId);
    expect(all[0]).toMatchObject({ type: "LEAD_ASSIGNED", read_at: null });
    await markNotificationRead(pool, { viewerId: salespersonId, notificationId: all[0].id });
    expect(await listNotifications(pool, salespersonId, { unreadOnly: true })).toEqual([]);
  });

  it("rejects marking another user's notification read", async () => {
    await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "Another one" });
    const [notification] = await listNotifications(pool, salespersonId);
    await expect(markNotificationRead(pool, { viewerId: otherUserId, notificationId: notification.id })).rejects.toThrow();
  });
});
