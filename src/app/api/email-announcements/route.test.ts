import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { POST, GET } from "./route";

const adminEmail = `announce-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let mhCookie: string;
let preSalesCookie: string;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];
const announcementIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `announce-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `announce-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `announce-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `announce-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);
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

function postAnnouncement(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/email-announcements", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

function getAnnouncements(cookie?: string) {
  return GET(new Request("http://localhost/api/email-announcements", { headers: cookie ? { cookie } : {} }));
}

describe("POST /api/email-announcements", () => {
  it("lets a Marketing Head send an announcement and returns per-recipient status", async () => {
    vi.spyOn(await import("@/lib/email/sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const res = await postAnnouncement(
      { subject: "Hi", body: "Hello team", recipientGroup: { type: "USER", userId: salespersonId } },
      mhCookie,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    announcementIds.push(body.id);
    expect(body.recipientStatusCounts).toMatchObject({ SENT: 1 });
  });

  it("rejects a Pre-sales user sending an announcement", async () => {
    const res = await postAnnouncement({ subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } }, preSalesCookie);
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await postAnnouncement({ subject: "Hi", body: "Hi", recipientGroup: { type: "USER", userId: salespersonId } });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/email-announcements", () => {
  it("scopes history to the caller's own sent announcements for a non-Super-Admin", async () => {
    vi.spyOn(await import("@/lib/email/sendEmail"), "sendEmail").mockResolvedValue({ ok: true });
    const sent = await postAnnouncement({ subject: "History", body: "x", recipientGroup: { type: "USER", userId: salespersonId } }, mhCookie);
    const sentBody = await sent.json();
    announcementIds.push(sentBody.id);

    const res = await getAnnouncements(mhCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.announcements.every((a: { sender_user_id: number }) => a.sender_user_id === sessionUserIds[1])).toBe(true);
  });
});
