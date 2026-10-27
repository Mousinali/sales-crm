import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { getSuperAdminDashboard } from "./superAdmin";

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

describe("getSuperAdminDashboard", () => {
  it("returns active-user counts by role, lead counts by status, and email failure count", async () => {
    const dashboard = await getSuperAdminDashboard(pool);
    expect(dashboard.activeUsersByRole).toMatchObject({ SUPER_ADMIN: expect.any(Number) });
    expect(dashboard.leadsByStatus).toEqual(expect.any(Object));
    expect(dashboard.emailDeliveryFailures).toEqual(expect.any(Number));
    expect(dashboard.assignmentActivityCount30d).toEqual(expect.any(Number));
    expect(dashboard.transferActivityCount30d).toEqual(expect.any(Number));
    expect(dashboard.upcomingVisits).toEqual(expect.any(Number));
    expect(dashboard.completedVisits).toEqual(expect.any(Number));
    expect(Array.isArray(dashboard.recentAuditLogs)).toBe(true);
  });
});
