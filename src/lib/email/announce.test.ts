import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createAnnouncement } from "./announce";
import { EmailActionNotAllowedError } from "./errors";

const adminEmail = `announce-admin-${Date.now()}@example.com`;
let mhId: number;
let preSalesId: number;
let salespersonId: number;
let activePreSalesId: number;
let inactivePreSalesId: number;
const createdEmails: string[] = [];
const announcementIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `announce-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `announce-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `announce-ps-${Date.now()}@example.com` });
  const activePs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Active PS", email: `announce-aps-${Date.now()}@example.com` });
  const inactivePs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Inactive PS", email: `announce-ips-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `announce-sp-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [inactivePs.id]);

  mhId = mh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  activePreSalesId = activePs.id;
  inactivePreSalesId = inactivePs.id;
  createdEmails.push(hr.email, mh.email, ps.email, activePs.email, inactivePs.email, sp.email);
});

afterAll(async () => {
  await pool.query(
    "DELETE FROM email_logs WHERE recipient_id IN (SELECT id FROM email_recipients WHERE announcement_id = ANY($1))",
    [announcementIds],
  );
  await pool.query("DELETE FROM email_recipients WHERE announcement_id = ANY($1)", [announcementIds]);
  await pool.query("DELETE FROM email_announcements WHERE id = ANY($1)", [announcementIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("createAnnouncement", () => {
  it("rejects a Pre-sales user composing an announcement", async () => {
    await expect(
      createAnnouncement(pool, { senderId: preSalesId, senderRole: "PRE_SALES", subject: "Hi", body: "Hi", recipientGroup: { type: "ALL_SALESPEOPLE" } }),
    ).rejects.toThrow(EmailActionNotAllowedError);
  });

  it("resolves ALL_PRE_SALES to only active Pre-sales users, excluding an inactive one", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Update", body: "Body", recipientGroup: { type: "ALL_PRE_SALES" } });
    announcementIds.push(announcement.id);
    const { rows } = await pool.query("SELECT recipient_user_id FROM email_recipients WHERE announcement_id = $1", [announcement.id]);
    const recipientIds = rows.map((r) => r.recipient_user_id);
    expect(recipientIds).toContain(activePreSalesId);
    expect(recipientIds).not.toContain(inactivePreSalesId);
  });

  it("creates one email_logs row per recipient and sends via sendEmail", async () => {
    const sendEmailMock = vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ subject: "Hi" }));
    const { rows } = await pool.query(
      `SELECT el.status FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`,
      [announcement.id],
    );
    expect(rows[0].status).toBe("SENT");
  });

  it("marks a recipient FAILED (not thrown) when sendEmail fails, without failing the others", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);
    const { rows } = await pool.query(
      `SELECT el.status, el.last_error FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`,
      [announcement.id],
    );
    expect(rows[0]).toMatchObject({ status: "FAILED", last_error: "bounced" });
  });

  it("resolves USERS to the given set of user ids", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USERS", userIds: [preSalesId, salespersonId] } });
    announcementIds.push(announcement.id);
    const { rows } = await pool.query("SELECT recipient_user_id FROM email_recipients WHERE announcement_id = $1", [announcement.id]);
    expect(rows.map((r) => r.recipient_user_id).sort()).toEqual([preSalesId, salespersonId].sort());
  });
});
