import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

/**
 * Applies pending `.sql` files from `migrationsDir`, in filename order,
 * tracking what's been applied in a `schema_migrations` table. Each file is
 * applied inside its own transaction (file contents + the tracking insert).
 *
 * Returns the filenames actually applied, in the order they were applied.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string,
): Promise<{ applied: string[] }> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const entries = await fs.readdir(migrationsDir);
  const filenames = entries.filter((name) => name.endsWith(".sql")).sort();

  const { rows } = await pool.query<{ id: string }>("SELECT id FROM schema_migrations");
  const alreadyApplied = new Set(rows.map((row) => row.id));

  const applied: string[] = [];

  for (const filename of filenames) {
    if (alreadyApplied.has(filename)) {
      continue;
    }

    const filePath = path.join(migrationsDir, filename);
    const sql = await fs.readFile(filePath, "utf8");

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [filename]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    applied.push(filename);
  }

  return { applied };
}
