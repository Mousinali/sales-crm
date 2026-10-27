import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { listServices } from "./list";

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
});

describe("listServices", () => {
  it("lists the seeded services alphabetically", async () => {
    const services = await listServices(pool);
    expect(services.length).toBeGreaterThanOrEqual(16);
    expect(services.some((s) => s.name === "Bulk SMS")).toBe(true);
    const names = services.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("filters by status", async () => {
    const active = await listServices(pool, { status: "ACTIVE" });
    expect(active.every((s) => s.status === "ACTIVE")).toBe(true);
  });
});
