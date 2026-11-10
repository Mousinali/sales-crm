import type { Pool } from "pg";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";

export type AuditLogEntry = {
  id: number;
  action: string;
  target_table: string | null;
  target_id: number | null;
  details: Record<string, unknown> | null;
  created_at: Date;
  actor_name: string | null;
};

export async function listAuditLogsPage(
  pool: Pool,
  filters: { q?: string },
  page: PageParams,
): Promise<PagedResult<AuditLogEntry>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`u.name ILIKE $${params.length}`);
  }

  const { rows } = await pool.query<AuditLogEntry & { total_count: number }>(
    `SELECT a.id, a.action, a.target_table, a.target_id, a.details, a.created_at, u.name AS actor_name,
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
