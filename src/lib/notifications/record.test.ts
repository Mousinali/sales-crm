import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createLead } from "@/lib/leads/create";
import { recordNotification, listNotifications, listNotificationsPage, markNotificationRead, deleteNotification } from "./record";

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
    // Scoped lookups by this test's own message, not "whatever's at index
    // 0" or "the whole list is empty": `salespersonId` is an active user
    // system-wide, so a broadcast-style notification from a concurrently
    // running test file (e.g. calendar's "notify every active user") can
    // legitimately land here too.
    await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "You were assigned Acme Corp" });
    const all = await listNotifications(pool, salespersonId);
    const created = all.find((n) => n.message === "You were assigned Acme Corp");
    expect(created).toMatchObject({ type: "LEAD_ASSIGNED", read_at: null });
    await markNotificationRead(pool, { viewerId: salespersonId, notificationId: created!.id });
    const unread = await listNotifications(pool, salespersonId, { unreadOnly: true });
    expect(unread.some((n) => n.id === created!.id)).toBe(false);
  });

  it("rejects marking another user's notification read", async () => {
    await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "Another one" });
    const [notification] = await listNotifications(pool, salespersonId);
    await expect(markNotificationRead(pool, { viewerId: otherUserId, notificationId: notification.id })).rejects.toThrow();
  });

  it("deletes a notification for its recipient, but rejects deleting another user's", async () => {
    await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", leadId: lead.id, message: "To be deleted" });
    const [notification] = await listNotifications(pool, salespersonId);

    await expect(deleteNotification(pool, { viewerId: otherUserId, notificationId: notification.id })).rejects.toThrow();

    await deleteNotification(pool, { viewerId: salespersonId, notificationId: notification.id });
    const remaining = await listNotifications(pool, salespersonId);
    expect(remaining.some((n) => n.id === notification.id)).toBe(false);
  });

  it("carries a related_user_id, so a chat notification can deep-link back to the sender", async () => {
    await recordNotification(pool, {
      recipientUserId: otherUserId,
      type: "CHAT_MESSAGE",
      relatedUserId: salespersonId,
      message: "SP sent you a message",
    });
    const [notification] = await listNotifications(pool, otherUserId);
    expect(notification).toMatchObject({ type: "CHAT_MESSAGE", related_user_id: salespersonId });
  });

  it("paginates and filters by type and message search", async () => {
    await recordNotification(pool, { recipientUserId: otherUserId, type: "CALENDAR_EVENT", message: "Meeting with the Notif Co team" });

    const byType = await listNotificationsPage(pool, otherUserId, { type: "CALENDAR_EVENT" }, { page: 1, pageSize: 20 });
    expect(byType.items.every((n) => n.type === "CALENDAR_EVENT")).toBe(true);
    expect(byType.items.some((n) => n.message === "Meeting with the Notif Co team")).toBe(true);

    const bySearch = await listNotificationsPage(pool, otherUserId, { q: "Notif Co team" }, { page: 1, pageSize: 20 });
    expect(bySearch.items.some((n) => n.message === "Meeting with the Notif Co team")).toBe(true);
    expect(bySearch.items.every((n) => n.message.includes("Notif Co team"))).toBe(true);

    const firstPage = await listNotificationsPage(pool, otherUserId, {}, { page: 1, pageSize: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBeGreaterThanOrEqual(2);
    expect(firstPage.totalPages).toBeGreaterThanOrEqual(2);
  });
});
