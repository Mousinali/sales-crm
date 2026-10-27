import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { getMarketingHeadDashboard } from "./marketingHead";

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

describe("getMarketingHeadDashboard", () => {
  it("returns company-wide lead/visit/task/transfer aggregates", async () => {
    const dashboard = await getMarketingHeadDashboard(pool);
    expect(dashboard.totalLeads).toEqual(expect.any(Number));
    expect(dashboard.pendingReviewLeads).toEqual(expect.any(Number));
    expect(dashboard.leadsByStatus).toEqual(expect.any(Object));
    expect(dashboard.leadsBySource).toEqual(expect.any(Object));
    expect(dashboard.leadsByPriority).toEqual(expect.any(Object));
    expect(dashboard.qualifiedLeads).toEqual(expect.any(Number));
    expect(dashboard.convertedLeads).toEqual(expect.any(Number));
    expect(dashboard.upcomingVisits).toEqual(expect.any(Number));
    expect(dashboard.missedVisits).toEqual(expect.any(Number));
    expect(Array.isArray(dashboard.overdueTasks)).toBe(true);
    expect(dashboard.transferHistoryCount).toEqual(expect.any(Number));
    expect(dashboard.conversionRate).toEqual(expect.any(Number));
  });
});
