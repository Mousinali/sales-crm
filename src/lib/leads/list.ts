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
  /** The Archive page's view: only archived leads, not a mix of both. */
  archivedOnly?: boolean;
};

export const LEAD_SORT_COLUMNS = ["company_name", "created_at"] as const;
export type LeadSortColumn = (typeof LEAD_SORT_COLUMNS)[number];

// The only two columns the leads table lets a viewer sort by — allow-listed
// here (rather than interpolating a caller-chosen column name straight into
// SQL) so a request can never smuggle in an arbitrary ORDER BY expression.
function buildOrderBy(sortBy: LeadSortColumn = "created_at", sortDir: "asc" | "desc" = "desc"): string {
  const column = sortBy === "company_name" ? "leads.company_name" : "leads.created_at";
  const direction = sortDir === "asc" ? "ASC" : "DESC";
  return `ORDER BY ${column} ${direction}`;
}

// Shared by `listLeads` (dashboards/aggregations — want every matching row)
// and `listLeadsPage` (the leads table — wants one page, server-side) so
// the visibility and filter rules never drift between the two call sites.
function buildLeadsWhere(viewer: { id: number; role: Role }, filters: LeadFilters): { whereClause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (viewer.role === "PRE_SALES") {
    params.push(viewer.id);
    conditions.push(`(leads.created_by = $${params.length} OR leads.pre_sales_owner_id = $${params.length})`);
  } else if (viewer.role === "SALESPERSON") {
    params.push(viewer.id);
    conditions.push(`leads.salesperson_owner_id = $${params.length}`);
  }

  if (filters.archivedOnly) {
    conditions.push("leads.archived_at IS NOT NULL");
  } else if (!filters.includeArchived) {
    conditions.push("leads.archived_at IS NULL");
  }
  if (filters.status) {
    params.push(filters.status);
    conditions.push(`leads.status = $${params.length}`);
  }
  if (filters.source) {
    params.push(filters.source);
    conditions.push(`leads.lead_source = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    conditions.push(`leads.priority = $${params.length}`);
  }
  if (filters.ownerId) {
    params.push(filters.ownerId);
    conditions.push(`(leads.pre_sales_owner_id = $${params.length} OR leads.salesperson_owner_id = $${params.length})`);
  }
  if (filters.dateFrom) {
    params.push(filters.dateFrom);
    conditions.push(`leads.created_at >= $${params.length}`);
  }
  if (filters.dateTo) {
    // Exclusive upper bound one day past dateTo, so a same-day lead (any
    // time after midnight) is still included — "to 2026-10-26" means
    // through the end of that day, not only up to its first instant.
    const exclusiveUpperBound = new Date(filters.dateTo);
    exclusiveUpperBound.setDate(exclusiveUpperBound.getDate() + 1);
    params.push(exclusiveUpperBound);
    conditions.push(`leads.created_at < $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(
      `(leads.company_name ILIKE $${params.length} OR leads.phone ILIKE $${params.length} OR leads.email ILIKE $${params.length} OR leads.website ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereClause, params };
}

export type LeadWithSale = LeadRow & {
  latest_sale_id: number | null;
  latest_sale_budget_amount: string | null;
  latest_sale_paid_amount: string | null;
  pre_sales_owner_name: string | null;
  salesperson_owner_name: string | null;
};

// A lead gets at most one "latest sale" badge — a company can be sold to
// more than once (repeat/upsell business), so this picks the most recent
// sales row rather than erroring on more than one match. Paid amount is
// summed from that one sale's payments, so the lead view can show paid vs.
// remaining without a second round trip.
const LATEST_SALE_JOIN = `
  LEFT JOIN LATERAL (
    SELECT s.id, s.budget_amount,
           COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_payments.sale_id = s.id), 0) AS paid_amount
    FROM sales s
    WHERE s.lead_id = leads.id
    ORDER BY s.created_at DESC
    LIMIT 1
  ) latest_sale ON true
`;
const LATEST_SALE_SELECT = `latest_sale.id AS latest_sale_id, latest_sale.budget_amount AS latest_sale_budget_amount, latest_sale.paid_amount AS latest_sale_paid_amount`;

// So the leads table can show an owner's name (and an avatar built from
// it) without a separate per-row request, the way getLeadOwnerNames does
// for the single-lead detail view.
const OWNER_JOIN = `
  LEFT JOIN users pre_sales_owner ON pre_sales_owner.id = leads.pre_sales_owner_id
  LEFT JOIN users salesperson_owner ON salesperson_owner.id = leads.salesperson_owner_id
`;
const OWNER_SELECT = `pre_sales_owner.name AS pre_sales_owner_name, salesperson_owner.name AS salesperson_owner_name`;

export async function listLeads(pool: Pool, viewer: { id: number; role: Role }, filters: LeadFilters): Promise<LeadWithSale[]> {
  if (viewer.role === "HR") return [];

  const { whereClause, params } = buildLeadsWhere(viewer, filters);
  const { rows } = await pool.query<LeadWithSale>(
    `SELECT leads.*, ${LATEST_SALE_SELECT}, ${OWNER_SELECT} FROM leads ${LATEST_SALE_JOIN} ${OWNER_JOIN} ${whereClause} ORDER BY leads.created_at DESC`,
    params,
  );
  return rows;
}

export async function listLeadsPage(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: LeadFilters,
  page: PageParams,
  sort?: { sortBy?: LeadSortColumn; sortDir?: "asc" | "desc" },
): Promise<PagedResult<LeadWithSale>> {
  if (viewer.role === "HR") return { items: [], page: page.page, pageSize: page.pageSize, total: 0, totalPages: 1 };

  const { whereClause, params } = buildLeadsWhere(viewer, filters);
  const { rows } = await pool.query<LeadWithSale & { total_count: number }>(
    `SELECT leads.*, ${LATEST_SALE_SELECT}, ${OWNER_SELECT}, count(*) OVER() AS total_count FROM leads ${LATEST_SALE_JOIN} ${OWNER_JOIN} ${whereClause}
     ${buildOrderBy(sort?.sortBy, sort?.sortDir)}
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
