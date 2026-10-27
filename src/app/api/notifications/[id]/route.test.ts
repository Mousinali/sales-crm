import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { recordNotification, listNotifications } from "@/lib/notifications/record";
import { PATCH } from "./route";

const adminEmail = `notif-id-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let spCookie: string;
let otherCookie: string;
let salespersonId: number;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `notif-id-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `notif-id-route-mh-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `notif-id-route-sp-${Date.now()}@example.com` });
  const other = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "Other", email: `notif-id-route-osp-${Date.now()}@example.com` });

  createdEmails.push(hr.email, mh.email, sp.email, other.email);
  sessionUserIds.push(hr.id, mh.id, sp.id, other.id);
  salespersonId = sp.id;

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[sp.id, other.id]]);
  spCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;
  otherCookie = `${SESSION_COOKIE_NAME}=${(await createSession(other.id)).token}`;

  await recordNotification(pool, { recipientUserId: salespersonId, type: "LEAD_ASSIGNED", message: "You were assigned Acme Corp" });
});

afterAll(async () => {
  await pool.query("DELETE FROM notifications WHERE recipient_user_id = $1", [salespersonId]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))", [[...createdEmails, adminEmail]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function patchNotification(id: number, cookie?: string) {
  return PATCH(
    new Request(`http://localhost/api/notifications/${id}`, { method: "PATCH", headers: cookie ? { cookie } : {} }),
    { params: Promise.resolve({ id: String(id) }) },
  );
}

describe("PATCH /api/notifications/[id]", () => {
  it("marks the viewer's own notification read", async () => {
    const [notification] = await listNotifications(pool, salespersonId);
    const res = await patchNotification(notification.id, spCookie);
    expect(res.status).toBe(200);
  });

  it("rejects marking another user's notification read with 404", async () => {
    const [notification] = await listNotifications(pool, salespersonId);
    const res = await patchNotification(notification.id, otherCookie);
    expect(res.status).toBe(404);
  });
});
