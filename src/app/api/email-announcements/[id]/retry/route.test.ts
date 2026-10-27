import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { createAnnouncement } from "@/lib/email/announce";
import { POST } from "./route";

const adminEmail = `announce-retry-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhId: number;
let mhCookie: string;
let preSalesCookie: string;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const announcementIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `announce-retry-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `announce-retry-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `announce-retry-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `announce-retry-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);
  mhId = mh.id;
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[mh.id, ps.id]]);
  mhCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
});

afterAll(async () => {
  await pool.query(
    "DELETE FROM email_logs WHERE recipient_id IN (SELECT id FROM email_recipients WHERE announcement_id = ANY($1))",
    [announcementIds],
  );
  await pool.query("DELETE FROM email_recipients WHERE announcement_id = ANY($1)", [announcementIds]);
  await pool.query("DELETE FROM email_announcements WHERE id = ANY($1)", [announcementIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

beforeEach(() => {
  vi.restoreAllMocks();
});

function postRetry(id: number, cookie?: string) {
  return POST(
    new Request(`http://localhost/api/email-announcements/${id}/retry`, { method: "POST", headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("POST /api/email-announcements/[id]/retry", () => {
  it("lets a Marketing Head retry failed recipients", async () => {
    vi.spyOn(await import("@/lib/email/sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    vi.spyOn(await import("@/lib/email/sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const res = await postRetry(announcement.id, mhCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ retried: 1, stillFailed: 0 });
  });

  it("rejects a Pre-sales user retrying", async () => {
    vi.spyOn(await import("@/lib/email/sendEmail"), "sendEmail").mockResolvedValue({ ok: false, error: "bounced" });
    const announcement = await createAnnouncement(pool, { senderId: mhId, senderRole: "MARKETING_HEAD", subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    announcementIds.push(announcement.id);

    const res = await postRetry(announcement.id, preSalesCookie);
    expect(res.status).toBe(403);
  });
});
