import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { getSuperAdminDashboard } from "./superAdmin";

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

describe("getSuperAdminDashboard", () => {
  it("returns active-user counts by role and lead counts by priority", async () => {
    const dashboard = await getSuperAdminDashboard(pool);
    expect(dashboard.activeUsersByRole).toMatchObject({ SUPER_ADMIN: expect.any(Number) });
    expect(dashboard.leadsByPriority).toEqual(expect.any(Object));
  });
});
