import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createService } from "./create";
import { ServiceActionNotAllowedError, ServiceNameAlreadyExistsError } from "./errors";

const adminEmail = `services-create-admin-${Date.now()}@example.com`;
let superAdminId: number;
const serviceIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
});

afterAll(async () => {
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = $1", [adminEmail]);
});

describe("createService", () => {
  it("lets a Super Admin create a service", async () => {
    const name = `Test Service ${Date.now()}`;
    const service = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name, description: "A test service" });
    serviceIds.push(service.id);
    expect(service).toMatchObject({ name, description: "A test service", status: "ACTIVE" });
  });

  it("rejects a non-Super-Admin creating a service", async () => {
    await expect(
      createService(pool, { actorId: superAdminId, actorRole: "MARKETING_HEAD", name: `Rejected ${Date.now()}` }),
    ).rejects.toThrow(ServiceActionNotAllowedError);
  });

  it("rejects a duplicate name", async () => {
    const name = `Duplicate Service ${Date.now()}`;
    const first = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name });
    serviceIds.push(first.id);
    await expect(createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name })).rejects.toThrow(
      ServiceNameAlreadyExistsError,
    );
  });
});
