import { config } from "dotenv";

config({ path: ".env.local" });

const { pool } = await import("../src/lib/db");
const { seedSuperAdmin } = await import("../src/lib/auth/seed");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  try {
    const email = requireEnv("SUPER_ADMIN_EMAIL");
    const name = requireEnv("SUPER_ADMIN_NAME");
    const password = requireEnv("SUPER_ADMIN_PASSWORD");

    const { id, created } = await seedSuperAdmin(pool, { email, name, password });
    console.log(
      created
        ? `Created Super Admin user (id=${id}, email=${email})`
        : `Super Admin user already exists (id=${id}, email=${email})`,
    );
    process.exitCode = 0;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
