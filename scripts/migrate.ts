import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({ path: ".env.local" });

const { pool } = await import("../src/lib/db");
const { runMigrations } = await import("../src/lib/migrate");

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  try {
    const migrationsDir = path.join(__dirname, "../migrations");
    const { applied } = await runMigrations(pool, migrationsDir);
    console.log(applied);
    process.exitCode = 0;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
