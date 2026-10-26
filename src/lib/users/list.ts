import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import type { UserRow } from "./types";

const VISIBLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"],
  HR: ["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"],
  MARKETING_HEAD: ["PRE_SALES", "SALESPERSON"],
  PRE_SALES: [],
  SALESPERSON: [],
};

export async function listUsers(
  pool: Pool,
  viewerRole: Role,
  filters: { role?: Role; status?: "ACTIVE" | "INACTIVE"; q?: string },
): Promise<UserRow[]> {
  const visibleRoles = VISIBLE_ROLES[viewerRole];
  if (visibleRoles.length === 0) return [];

  const roleFilter = filters.role && visibleRoles.includes(filters.role) ? [filters.role] : visibleRoles;

  const conditions = ["role = ANY($1)"];
  const params: unknown[] = [roleFilter];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  const { rows } = await pool.query<UserRow>(
    `SELECT id, role, name, email, status, created_by, created_at, updated_at
     FROM users
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    params,
  );
  return rows;
}
