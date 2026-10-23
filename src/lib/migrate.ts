import fs from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

// Arbitrary bigint constant used as the Postgres advisory lock key for the
// migration runner below. It has no meaning beyond "the migration lock" —
// it was chosen once (727211) and must never change, or concurrent old/new
// processes could fail to see each other's lock.
const MIGRATION_LOCK_KEY = 727211;

/**
 * Applies pending `.sql` files from `migrationsDir`, in filename order,
 * tracking what's been applied in a `schema_migrations` table. Each file is
 * applied inside its own transaction (file contents + the tracking insert).
 *
 * Takes a Postgres advisory lock for the duration of the run so concurrent
 * callers (e.g. parallel test files that each run migrations in `beforeAll`,
 * or multiple app instances migrating on startup) serialize instead of
 * racing on the `CREATE TABLE IF NOT EXISTS schema_migrations` bootstrap or
 * on deciding which files are pending.
 *
 * Returns the filenames actually applied, in the order they were applied.
 */
export async function runMigrations(
  pool: Pool,
  migrationsDir: string,
): Promise<{ applied: string[] }> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);

    await lockClient.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const entries = await fs.readdir(migrationsDir);
    const filenames = entries.filter((name) => name.endsWith(".sql")).sort();

    const { rows } = await lockClient.query<{ id: string }>(
      "SELECT id FROM schema_migrations",
    );
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
        // Guard the rollback itself: if it throws too (e.g. the connection
        // already dropped), we want the original migration error to
        // propagate, not this secondary one.
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      applied.push(filename);
    }

    return { applied };
  } finally {
    // Guard the unlock call too: if it throws, we still must release the
    // client back to the pool rather than leaking it.
    await lockClient.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    lockClient.release();
  }
}
