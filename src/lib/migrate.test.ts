import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import { pool } from "./db";
import { runMigrations } from "./migrate";

const fixtureDir = path.join(__dirname, "../../tests/fixtures/sample-migrations");

afterAll(async () => {
  await pool.query("DROP TABLE IF EXISTS demo_items");
  await pool.query("DELETE FROM schema_migrations WHERE id LIKE '0001_create_demo_table.sql' OR id LIKE '0002_alter_demo_table.sql'");
});

describe("runMigrations", () => {
  it("applies pending migrations in filename order and is idempotent on rerun", async () => {
    const first = await runMigrations(pool, fixtureDir);
    expect(first.applied).toEqual(["0001_create_demo_table.sql", "0002_alter_demo_table.sql"]);

    const second = await runMigrations(pool, fixtureDir);
    expect(second.applied).toEqual([]);

    const { rows } = await pool.query("SELECT label FROM demo_items");
    expect(rows).toEqual([]);
  });
});
