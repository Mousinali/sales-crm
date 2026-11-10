import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createSession, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { createUser } from "@/lib/users/create";
import { POST, GET } from "./route";

const adminEmail = `sales-route-admin-${Date.now()}@example.com`;
let superAdminId: number;
let marketingHeadCookie: string;
let preSalesCookie: string;
let salespersonCookie: string;
let hrCookie: string;
const createdEmails: string[] = [];
const sessionUserIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const hr = await createUser(pool, { creatorId: superAdminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `sales-route-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `sales-route-mh-${Date.now()}@example.com` });
  const ps = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "PRE_SALES", name: "PS", email: `sales-route-ps-${Date.now()}@example.com` });
  const sp = await createUser(pool, { creatorId: mh.id, creatorRole: "MARKETING_HEAD", role: "SALESPERSON", name: "SP", email: `sales-route-sp-${Date.now()}@example.com` });
  createdEmails.push(hr.email, mh.email, ps.email, sp.email);
  sessionUserIds.push(hr.id, mh.id, ps.id, sp.id);

  await pool.query("UPDATE users SET must_change_password = false WHERE id = ANY($1)", [[hr.id, mh.id, ps.id, sp.id]]);

  hrCookie = `${SESSION_COOKIE_NAME}=${(await createSession(hr.id)).token}`;
  marketingHeadCookie = `${SESSION_COOKIE_NAME}=${(await createSession(mh.id)).token}`;
  preSalesCookie = `${SESSION_COOKIE_NAME}=${(await createSession(ps.id)).token}`;
  salespersonCookie = `${SESSION_COOKIE_NAME}=${(await createSession(sp.id)).token}`;
});

afterAll(async () => {
  await pool.query("DELETE FROM sales WHERE created_by = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY($1)", [[superAdminId, ...sessionUserIds]]);
  await pool.query("DELETE FROM sessions WHERE user_id = ANY($1)", [sessionUserIds]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

function postSales(body: unknown, cookie?: string) {
  return POST(
    new Request("http://localhost/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

function getSales(cookie?: string) {
  return GET(new Request("http://localhost/api/sales", { headers: cookie ? { cookie } : {} }));
}

describe("POST /api/sales", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await postSales({ companyName: "X", budgetAmount: 100, budgetType: "ONE_TIME" });
    expect(res.status).toBe(401);
  });

  it("rejects HR (no lead/sale access)", async () => {
    const res = await postSales({ companyName: "X", budgetAmount: 100, budgetType: "ONE_TIME" }, hrCookie);
    expect(res.status).toBe(403);
  });

  it("lets a Salesperson record a sale, crediting themself", async () => {
    const res = await postSales({ companyName: "Route SP Co", budgetAmount: 500, budgetType: "ONE_TIME" }, salespersonCookie);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sold_by_type).toBe("SALESPERSON");
  });

  it("lets a Pre-sales user record a sale", async () => {
    const res = await postSales({ companyName: "Route PS Co", budgetAmount: 500, budgetType: "MONTHLY" }, preSalesCookie);
    expect(res.status).toBe(201);
  });

  it("lets a Marketing Head record a sale crediting a custom name", async () => {
    const res = await postSales(
      { companyName: "Route MH Co", budgetAmount: 500, budgetType: "PART_PAYMENT", soldByType: "CUSTOM", soldByCustomName: "Walk-in agent" },
      marketingHeadCookie,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sold_by_custom_name).toBe("Walk-in agent");
  });

  it("rejects a sale with no company name and no lead", async () => {
    const res = await postSales({ budgetAmount: 500, budgetType: "ONE_TIME" }, preSalesCookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/sales", () => {
  it("rejects an unauthenticated request", async () => {
    expect((await getSales()).status).toBe(401);
  });

  it("lets a Marketing Head list sales", async () => {
    const res = await getSales(marketingHeadCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sales)).toBe(true);
  });
});
