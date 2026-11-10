import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import type { SaleRow } from "./types";

type SaleFilters = {
  dateFrom?: Date;
  dateTo?: Date;
  q?: string;
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
  if (viewer.role === "PRE_SALES" || viewer.role === "SALESPERSON") {
    params.push(viewer.id);
    conditions.push(`(sales.created_by = $${params.length} OR sales.sold_by_user_id = $${params.length})`);
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
    params.push(`%${filters.q}%`);
    conditions.push(`sales.company_name ILIKE $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

const SOLD_BY_DISPLAY_NAME_SELECT = `
  CASE sales.sold_by_type WHEN 'CUSTOM' THEN sales.sold_by_custom_name ELSE sold_by_user.name END AS sold_by_display_name
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
  const { rows } = await pool.query<SaleRow & { total_count: number }>(
    `SELECT sales.*, ${SOLD_BY_DISPLAY_NAME_SELECT}, ${PAID_AMOUNT_SELECT}, count(*) OVER() AS total_count
     FROM sales ${SOLD_BY_USER_JOIN} ${PAID_AMOUNT_JOIN} ${whereClause}
     ORDER BY sale_date DESC, sales.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
