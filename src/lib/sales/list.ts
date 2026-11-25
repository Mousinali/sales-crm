import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import { leadVisibleSql } from "@/lib/leads/visibility";
import type { SaleRow, SaleBudgetType } from "./types";

export type SaleFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  q?: string;
  budgetType?: SaleBudgetType;
};

// Mirrors leads/list.ts's buildLeadsWhere: Marketing Head (and above) sees
// every sale; a Pre-sales or Salesperson sees only the ones they recorded or
// were credited with; HR has no lead/sale access at all (req.md §3.2).
function buildSalesWhere(viewer: { id: number; role: Role }, filters: SaleFilters): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  // Columns qualified with `sales.` throughout — listSales/listSalesPage join
  // in the users table (aliased sold_by_user), which also has created_by, so
  // an unqualified reference here would be ambiguous to Postgres.
  // A sale is also visible to anyone who can see its lead (created/owns it, or
  // it was shared with them), so a shared lead's sales are shared with it.
  if (viewer.role === "MARKETING_HEAD" || viewer.role === "PRE_SALES" || viewer.role === "SALESPERSON") {
    params.push(viewer.id);
    conditions.push(
      `(sales.created_by = $${params.length} OR sales.sold_by_user_id = $${params.length}
        OR EXISTS (SELECT 1 FROM leads l WHERE l.id = sales.lead_id AND ${leadVisibleSql("l", `$${params.length}`)}))`,
    );
  }

  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`sales.sale_date >= $${params.length}`);
  }
  if (filters.dateTo) {
    params.push(filters.dateTo);
    conditions.push(`sales.sale_date <= $${params.length}`);
  }
  if (filters.q) {
    // Company name alone missed the identifiers people search by on this
    // screen, so the sale number and contact person match the same box.
    // Must stay byte-identical to idx_sales_search_trgm (migration 0040) so the planner uses it.
    params.push(`%${filters.q}%`);
    conditions.push(
      `(coalesce(sales.company_name, '') || ' ' || coalesce(sales.sale_number, '') || ' ' || coalesce(sales.contact_person, '')) ILIKE $${params.length}`,
    );
  }
  if (filters.budgetType) {
    params.push(filters.budgetType);
    conditions.push(`sales.budget_type = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

const SOLD_BY_DISPLAY_NAME_SELECT = `
  CASE sales.sold_by_type WHEN 'CUSTOM' THEN sales.sold_by_custom_name ELSE sold_by_user.name END AS sold_by_display_name,
  CASE sales.sold_by_type WHEN 'CUSTOM' THEN NULL ELSE sold_by_user.avatar_url END AS sold_by_avatar_url
`;
const SOLD_BY_USER_JOIN = `LEFT JOIN users sold_by_user ON sold_by_user.id = sales.sold_by_user_id`;
const PAID_AMOUNT_SELECT = `COALESCE(paid.total, 0) AS paid_amount`;
const PAID_AMOUNT_JOIN = `LEFT JOIN LATERAL (SELECT SUM(amount) AS total FROM sale_payments WHERE sale_payments.sale_id = sales.id) paid ON true`;

export async function listSales(pool: Pool, viewer: { id: number; role: Role }, filters: SaleFilters): Promise<SaleRow[]> {
  if (viewer.role === "HR") return [];

  const { whereClause, params } = buildSalesWhere(viewer, filters);
  const { rows } = await pool.query<SaleRow>(
    `SELECT sales.*, ${SOLD_BY_DISPLAY_NAME_SELECT}, ${PAID_AMOUNT_SELECT} FROM sales ${SOLD_BY_USER_JOIN} ${PAID_AMOUNT_JOIN} ${whereClause} ORDER BY sale_date DESC, sales.created_at DESC`,
    params,
  );
  return rows;
}

export async function listSalesPage(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: SaleFilters,
  page: PageParams,
): Promise<PagedResult<SaleRow>> {
  if (viewer.role === "HR") return { items: [], page: page.page, pageSize: page.pageSize, total: 0, totalPages: 1 };

  const { whereClause, params } = buildSalesWhere(viewer, filters);
  // Page and total are separate queries so the paid-amount lookup runs only
  // for the page's rows, not every matching sale (count(*) OVER() forces all).
  const orderBy = "ORDER BY sale_date DESC, sales.created_at DESC";
  const [pageResult, countResult] = await Promise.all([
    pool.query<SaleRow>(
      `SELECT sales.*, ${SOLD_BY_DISPLAY_NAME_SELECT}, ${PAID_AMOUNT_SELECT}
       FROM (SELECT sales.* FROM sales ${whereClause} ${orderBy} LIMIT $${params.length + 1} OFFSET $${params.length + 2}) sales
       ${SOLD_BY_USER_JOIN} ${PAID_AMOUNT_JOIN}
       ${orderBy}`,
      [...params, page.pageSize, (page.page - 1) * page.pageSize],
    ),
    pool.query<{ count: number }>(`SELECT count(*) FROM sales ${whereClause}`, params),
  ]);
  const total_count = countResult.rows[0].count;
  const rows = pageResult.rows.map((row) => ({ ...row, total_count }));
  return toPagedResult(rows, page);
}
