import type { Pool } from "pg";
import { hashPassword } from "./passwords";

/**
 * Creates the SUPER_ADMIN user with the given email if one doesn't already
 * exist. Idempotent: calling it again with the same email is a safe no-op
 * that returns the existing user's id with `created: false`.
 */
export async function seedSuperAdmin(
  pool: Pool,
  input: { email: string; name: string; password: string },
): Promise<{ id: number; created: boolean }> {
  const passwordHash = await hashPassword(input.password);

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO users (role, name, email, password_hash, status, created_by)
     VALUES ('SUPER_ADMIN', $1, $2, $3, 'ACTIVE', NULL)
     ON CONFLICT (email) DO NOTHING
     RETURNING id`,
    [input.name, input.email, passwordHash],
  );

  if (inserted.rows.length > 0) {
    return { id: inserted.rows[0].id, created: true };
  }

  const existing = await pool.query<{ id: number }>("SELECT id FROM users WHERE email = $1", [input.email]);
  return { id: existing.rows[0].id, created: false };
}
