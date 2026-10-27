import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createService } from "./create";
import { updateService } from "./update";
import { ServiceActionNotAllowedError, ServiceNotFoundError, ServiceNameAlreadyExistsError } from "./errors";

const adminEmail = `services-update-admin-${Date.now()}@example.com`;
let superAdminId: number;
const serviceIds: number[] = [];

let myService: { id: number };

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  superAdminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  myService = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Update Target ${Date.now()}` });
  serviceIds.push(myService.id);
});

afterAll(async () => {
  await pool.query("DELETE FROM services WHERE id = ANY($1)", [serviceIds]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [superAdminId]);
  await pool.query("DELETE FROM users WHERE email = $1", [adminEmail]);
});

describe("updateService", () => {
  it("lets a Super Admin edit name, description, and status", async () => {
    const newName = `Renamed ${Date.now()}`;
    const updated = await updateService(pool, {
      actorId: superAdminId,
      actorRole: "SUPER_ADMIN",
      serviceId: myService.id,
      fields: { name: newName, description: "Updated description", status: "INACTIVE" },
    });
    expect(updated).toMatchObject({ name: newName, description: "Updated description", status: "INACTIVE" });
  });

  it("rejects a non-Super-Admin editing a service", async () => {
    await expect(
      updateService(pool, { actorId: superAdminId, actorRole: "MARKETING_HEAD", serviceId: myService.id, fields: { status: "ACTIVE" } }),
    ).rejects.toThrow(ServiceActionNotAllowedError);
  });

  it("404s a service id that doesn't exist", async () => {
    await expect(
      updateService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", serviceId: 999999999, fields: { status: "ACTIVE" } }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it("rejects renaming to a name already in use", async () => {
    const other = await createService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", name: `Other ${Date.now()}` });
    serviceIds.push(other.id);
    await expect(
      updateService(pool, { actorId: superAdminId, actorRole: "SUPER_ADMIN", serviceId: myService.id, fields: { name: other.name } }),
    ).rejects.toThrow(ServiceNameAlreadyExistsError);
  });
});
