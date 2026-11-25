import type { Pool } from "pg";
import { AUDIT_CATEGORIES, categoryOfAction, type AuditCategoryKey, type AuditPeriod } from "./categories";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";

export type AuditLogEntry = {
  id: number;
  action: string;
  target_table: string | null;
  target_id: number | null;
  details: Record<string, unknown> | null;
  created_at: Date;
  actor_user_id: number | null;
  actor_name: string | null;
};

function periodCondition(period: AuditPeriod): string {
  return period === "today" ? "a.created_at >= date_trunc('day', now())" : `a.created_at >= now() - interval '${period === "7d" ? 7 : 30} days'`;
}

export async function listAuditLogsPage(
  pool: Pool,
  filters: { q?: string; userId?: number; category?: AuditCategoryKey; period?: AuditPeriod },
  page: PageParams,
): Promise<PagedResult<AuditLogEntry>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`u.name ILIKE $${params.length}`);
  }

  if (filters.category) {
    params.push(AUDIT_CATEGORIES.find((c) => c.key === filters.category)!.patterns);
    conditions.push(`a.action LIKE ANY($${params.length}::text[])`);
  }
  if (filters.period) {
    conditions.push(periodCondition(filters.period));
  }
  if (filters.userId) {
    params.push(filters.userId);
    conditions.push(`a.actor_user_id = $${params.length}`);
  }

  const { rows } = await pool.query<AuditLogEntry & { total_count: number }>(
    `SELECT a.id, a.action, a.target_table, a.target_id, a.details, a.created_at, a.actor_user_id, u.name AS actor_name,
            count(*) OVER() AS total_count
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY a.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}

/** How many entries a user has per filter group in the period, for the chip counts on their timeline. */
export async function countAuditByCategory(pool: Pool, userId: number, period?: AuditPeriod): Promise<Record<AuditCategoryKey, number>> {
  const { rows } = await pool.query<{ action: string; n: number }>(
    `SELECT a.action, count(*)::int AS n FROM audit_logs a WHERE a.actor_user_id = $1 ${period ? `AND ${periodCondition(period)}` : ""} GROUP BY a.action`,
    [userId],
  );
  const counts = Object.fromEntries(AUDIT_CATEGORIES.map((c) => [c.key, 0])) as Record<AuditCategoryKey, number>;
  for (const row of rows) {
    const key = categoryOfAction(row.action);
    if (key) counts[key] += row.n;
  }
  return counts;
}
