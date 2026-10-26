import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import type { LeadRow, LeadStatus, LeadSource, LeadPriority } from "./types";

export async function listLeads(
  pool: Pool,
  viewer: { id: number; role: Role },
  filters: {
    status?: LeadStatus;
    source?: LeadSource;
    priority?: LeadPriority;
    ownerId?: number;
    dateFrom?: Date;
    dateTo?: Date;
    q?: string;
    includeArchived?: boolean;
  },
): Promise<LeadRow[]> {
  if (viewer.role === "HR") return [];

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
  if (filters.dateFrom && filters.dateTo) {
    params.push(filters.dateFrom, filters.dateTo);
    conditions.push(`created_at BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(
      `(company_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length} OR website ILIKE $${params.length})`,
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<LeadRow>(
    `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC`,
    params,
  );
  return rows;
}
