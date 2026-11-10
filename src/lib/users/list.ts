import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import type { UserRow } from "./types";

// Just the self-service fields the Settings page's own contact-details form
// needs to prefill — not the full `UserRow` a Team-management view needs.
export async function getOwnContactDetails(
  pool: Pool,
  userId: number,
): Promise<{ phone: string | null; whatsappNumber: string | null }> {
  const { rows } = await pool.query<{ phone: string | null; whatsapp_number: string | null }>(
    "SELECT phone, whatsapp_number FROM users WHERE id = $1",
    [userId],
  );
  return { phone: rows[0]?.phone ?? null, whatsappNumber: rows[0]?.whatsapp_number ?? null };
}

const VISIBLE_ROLES: Record<Role, readonly Role[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"],
  HR: ["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"],
  MARKETING_HEAD: ["PRE_SALES", "SALESPERSON"],
  PRE_SALES: [],
  SALESPERSON: [],
};

type UserFilters = {
  role?: Role;
  status?: "ACTIVE" | "INACTIVE";
  q?: string;
  /** The Archive page's view: only archived (deleted) users, not the normal roster. */
  archivedOnly?: boolean;
};

// Shared by `listUsers` (used wherever the full visible set is needed) and
// `listUsersPage` (the Team table), so visibility rules can't drift apart.
function buildUsersWhere(viewerRole: Role, filters: UserFilters): { whereClause: string; params: unknown[] } | null {
  const visibleRoles = VISIBLE_ROLES[viewerRole];
  if (visibleRoles.length === 0) return null;

  const roleFilter = filters.role && visibleRoles.includes(filters.role) ? [filters.role] : visibleRoles;

  const conditions = ["role = ANY($1)", filters.archivedOnly ? "archived_at IS NOT NULL" : "archived_at IS NULL"];
  const params: unknown[] = [roleFilter];

  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`(name ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }

  return { whereClause: `WHERE ${conditions.join(" AND ")}`, params };
}

const USER_COLUMNS =
  "id, role, name, email, status, employee_id, phone, whatsapp_number, designation, avatar_url, archived_at, created_by, created_at, updated_at";

export async function listUsers(pool: Pool, viewerRole: Role, filters: UserFilters): Promise<UserRow[]> {
  const built = buildUsersWhere(viewerRole, filters);
  if (!built) return [];

  const { rows } = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM users
     ${built.whereClause}
     ORDER BY created_at DESC`,
    built.params,
  );
  return rows;
}

export async function listUsersPage(pool: Pool, viewerRole: Role, filters: UserFilters, page: PageParams): Promise<PagedResult<UserRow>> {
  const built = buildUsersWhere(viewerRole, filters);
  if (!built) return { items: [], page: page.page, pageSize: page.pageSize, total: 0, totalPages: 1 };

  const { rows } = await pool.query<UserRow & { total_count: number }>(
    `SELECT ${USER_COLUMNS}, count(*) OVER() AS total_count
     FROM users
     ${built.whereClause}
     ORDER BY created_at DESC
     LIMIT $${built.params.length + 1} OFFSET $${built.params.length + 2}`,
    [...built.params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
