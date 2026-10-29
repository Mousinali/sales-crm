import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import type { LeadRow, LeadStatus, LeadSource, LeadPriority } from "./types";

type LeadFilters = {
  status?: LeadStatus;
  source?: LeadSource;
  priority?: LeadPriority;
  ownerId?: number;
  dateFrom?: Date;
  dateTo?: Date;
  q?: string;
  includeArchived?: boolean;
};

// Shared by `listLeads` (dashboards/aggregations — want every matching row)
// and `listLeadsPage` (the leads table — wants one page, server-side) so
// the visibility and filter rules never drift between the two call sites.
function buildLeadsWhere(viewer: { id: number; role: Role }, filters: LeadFilters): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (viewer.role === "PRE_SALES") {
    params.push(viewer.id);
    conditions.push(`(created_by = $${params.length} OR pre_sales_owner_id = $${params.length})`);
  } else if (viewer.role === "SALESPERSON") {
    params.push(viewer.id);
    conditions.push(`salesperson_owner_id = $${params.length}`);
  }

  if (!filters.includeArchived) {
    conditions.push("archived_at IS NULL");
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`status = $${params.length}`);
  }
  if (filters.source) {
    params.push(filters.source);
    conditions.push(`lead_source = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    conditions.push(`priority = $${params.length}`);
  }
  if (filters.ownerId) {
    params.push(filters.ownerId);
    conditions.push(`(pre_sales_owner_id = $${params.length} OR salesperson_owner_id = $${params.length})`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`created_at >= $${params.length}`);
  }
  if (filters.dateTo) {
    // Exclusive upper bound one day past dateTo, so a same-day lead (any
    // time after midnight) is still included — "to 2026-10-26" means
    // through the end of that day, not only up to its first instant.
    const exclusiveUpperBound = new Date(filters.dateTo);
    exclusiveUpperBound.setDate(exclusiveUpperBound.getDate() + 1);
    params.push(exclusiveUpperBound);
    conditions.push(`created_at < $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(
      `(company_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length} OR website ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

export async function listLeads(pool: Pool, viewer: { id: number; role: Role }, filters: LeadFilters): Promise<LeadRow[]> {
  if (viewer.role === "HR") return [];

  const { whereClause, params } = buildLeadsWhere(viewer, filters);
  const { rows } = await pool.query<LeadRow>(`SELECT * FROM leads ${whereClause} ORDER BY created_at DESC`, params);
  return rows;
}

export async function listLeadsPage(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: LeadFilters,
  page: PageParams,
): Promise<PagedResult<LeadRow>> {
  if (viewer.role === "HR") return { items: [], page: page.page, pageSize: page.pageSize, total: 0, totalPages: 1 };

  const { whereClause, params } = buildLeadsWhere(viewer, filters);
  const { rows } = await pool.query<LeadRow & { total_count: number }>(
    `SELECT *, count(*) OVER() AS total_count FROM leads ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
