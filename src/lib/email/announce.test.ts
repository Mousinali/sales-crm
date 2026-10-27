import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createAnnouncement, retryFailedRecipients } from "./announce";
import { EmailActionNotAllowedError, EmailAnnouncementNotFoundError } from "./errors";

const adminEmail = `announce-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let otherMhId: number;
let preSalesId: number;
let salespersonId: number;
let activePreSalesId: number;
let inactivePreSalesId: number;
const createdEmails: string[] = [];
const announcementIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `announce-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `announce-mh-${Date.now()}@example.com` });
  const otherMh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "Other MH", email: `announce-omh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `announce-ps-${Date.now()}@example.com` });
  const activePs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Active PS", email: `announce-aps-${Date.now()}@example.com` });
  const inactivePs = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "Inactive PS", email: `announce-ips-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `announce-sp-${Date.now()}@example.com` });
  await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [inactivePs.id]);

  mhId = mh.id;
  otherMhId = otherMh.id;
  preSalesId = ps.id;
  salespersonId = sp.id;
  activePreSalesId = activePs.id;
  inactivePreSalesId = inactivePs.id;
  createdEmails.push(hr.email, mh.email, otherMh.email, ps.email, activePs.email, inactivePs.email, sp.email);
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

  it("rejects HR composing an announcement", async () => {
    await expect(
      createAnnouncement(pool, { senderId: superAdminId, senderRole: "HR", subject: "Hi", body: "Hi", recipientGroup: { type: "ALL_SALESPEOPLE" } }),
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

  it("drops a USERS id that isn't an active Pre-sales/Salesperson — e.g. a Marketing Head id — rather than emailing them", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USERS", userIds: [preSalesId, mhId, inactivePreSalesId] } });
    announcementIds.push(announcement.id);
    const { rows } = await pool.query("SELECT recipient_user_id FROM email_recipients WHERE announcement_id = $1", [announcement.id]);
    expect(rows.map((r) => r.recipient_user_id)).toEqual([preSalesId]);
  });

  it("drops a USER id that isn't an active Pre-sales/Salesperson", async () => {
    const sendEmailMock = vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: mhId } });
    announcementIds.push(announcement.id);
    expect(sendEmailMock).not.toHaveBeenCalled();
    const { rows } = await pool.query("SELECT recipient_user_id FROM email_recipients WHERE announcement_id = $1", [announcement.id]);
    expect(rows).toEqual([]);
  });
});

describe("retryFailedRecipients", () => {
  it("retries only FAILED recipients, leaving SENT ones untouched", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USERS", userIds: [preSalesId, salespersonId] } });
    announcementIds.push(announcement.id);

    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
    expect(result).toEqual({ retried: 1, stillFailed: 0 });

    const { rows } = await pool.query(
      `SELECT status, attempt_count FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1 ORDER BY el.id`,
      [announcement.id],
    );
    expect(rows.every((r) => r.status === "SENT")).toBe(true);
    expect(rows.find((r) => r.attempt_count >= 2)).toBeTruthy();
  });

  it("does not retry a recipient that already hit maxAttempts", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id, maxAttempts: 1 });
    expect(result.retried).toBe(0);
  });

  it("rejects a non-Marketing-Head/Super-Admin retrying", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    await expect(
      retryFailedRecipients(pool, { actorId: preSalesId, actorRole: "PRE_SALES", announcementId: announcement.id }),
    ).rejects.toThrow(EmailActionNotAllowedError);
  });

  it("rejects HR retrying an announcement", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    await expect(
      retryFailedRecipients(pool, { actorId: superAdminId, actorRole: "HR", announcementId: announcement.id }),
    ).rejects.toThrow(EmailActionNotAllowedError);
  });

  it("rejects a Marketing Head retrying another Marketing Head's announcement", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    await expect(
      retryFailedRecipients(pool, { actorId: otherMhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id }),
    ).rejects.toThrow(EmailActionNotAllowedError);
  });

  it("lets a Super Admin retry any Marketing Head's announcement", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValueOnce({ ok: false, error: "bounced" }).mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    const result = await retryFailedRecipients(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", announcementId: announcement.id });
    expect(result).toEqual({ retried: 1, stillFailed: 0 });
  });

  it("throws for a nonexistent announcement id", async () => {
    await expect(
      retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: 999999999 }),
    ).rejects.toThrow(EmailAnnouncementNotFoundError);
  });

  it("does not resend to a recipient who's no longer an active Pre-sales/Salesperson", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const deactivating = await createUser(pool, { creatorId: mhId, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Deactivating", email: `announce-deactivating-${Date.now()}@example.com` });
    createdEmails.push(deactivating.email);
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: deactivating.id } });
    announcementIds.push(announcement.id);

    await pool.query("UPDATE users SET status = 'INACTIVE' WHERE id = $1", [deactivating.id]);

    const sendEmailMock = vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    sendEmailMock.mockClear(); // drop the call recorded by the initial (failed) createAnnouncement send above
    const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(result).toEqual({ retried: 0, stillFailed: 1 });
  });

  it("claims each row atomically, so two concurrent retries never both send the same recipient", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    const sendEmailMock = vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    sendEmailMock.mockClear(); // drop the call recorded by the initial (failed) createAnnouncement send above
    const [a, b] = await Promise.all([
      retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id }),
      retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id }),
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(a.retried + b.retried).toBe(1);
  });

  it("never re-sends an already-SENT recipient even if retry is called twice in a row", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);
    const sendEmailMock = vi.mocked((await import("./sendEmail")).sendEmail);
    sendEmailMock.mockClear();
    await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
    await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id });
    expect(sendEmailMock).not.toHaveBeenCalled(); // already SENT from createAnnouncement's own attempt — nothing left to retry
  });

  it("stops retrying a recipient once attempt_count reaches maxAttempts, leaving it FAILED", async () => {
    vi.spyOn(await import("./sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "still down" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);
    await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id, maxAttempts: 2 });
    const result = await retryFailedRecipients(pool, { actorId: mhId, actorRole: "MARKETING_HEAD", announcementId: announcement.id, maxAttempts: 2 });
    expect(result.retried).toBe(0);
    const { rows } = await pool.query(
      `SELECT status FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id WHERE er.announcement_id = $1`, [announcement.id],
    );
    expect(rows[0].status).toBe("FAILED");
  });
});
