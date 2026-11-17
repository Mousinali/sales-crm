import type { Pool } from "pg";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";
import { leadVisibleSql } from "@/lib/leads/visibility";
import type { CompanySummary } from "./types";

// Roles that see every company get no scope; the rest are scoped to their visible leads.
export function viewerScope(user: { id: number; role: string }): number | undefined {
  return user.role === "SUPER_ADMIN" || user.role === "ACCOUNTANT" ? undefined : user.id;
}

type CompanyFilters = {
  q?: string;
  /** The Archive page's view: a company only counts as archived once every one of its leads is. */
  archivedOnly?: boolean;
};

// DISTINCT ON (company_name_normalized), ordered by created_at DESC within
// each company, picks that company's most recent lead as its profile —
// same normalized key leads/duplicates.ts already uses to recognize the
// same company across separately-entered leads.
// `viewerId` narrows the roll-up to leads that user can see (their own plus shared
// ones); omit it for the roles that see every company (Super Admin, Accountant).
export async function listCompaniesPage(pool: Pool, filters: CompanyFilters, page: PageParams, viewerId?: number): Promise<PagedResult<CompanySummary>> {
  const params: unknown[] = [];
  let searchClause = "";
  if (filters.q) {
    params.push(`%${filters.q}%`);
    searchClause = `AND company_name ILIKE $${params.length}`;
  }

  if (viewerId !== undefined) {
    params.push(viewerId);
    searchClause += ` AND ${leadVisibleSql("leads", `$${params.length}`)}`;
  }

  // "Archived" is a property of the whole company, not any one lead: a
  // company only belongs here once every lead under its normalized name has
  // been archived (individually or via DELETE /api/companies/[name], which
  // archives them all at once) — one still-active lead keeps it out of
  // this view entirely, not showing it as a mix.
  const scopeClause = filters.archivedOnly
    ? `company_name_normalized IN (
         SELECT company_name_normalized FROM leads GROUP BY company_name_normalized HAVING bool_and(archived_at IS NOT NULL)
       )`
    : `archived_at IS NULL`;

  const { rows } = await pool.query<CompanySummary & { total_count: number }>(
    `SELECT *, count(*) OVER() AS total_count FROM (
       SELECT DISTINCT ON (company_name_normalized)
         company_name_normalized, company_name, industry, business_type, location,
         address, state, pincode, country, phone, email, website,
         created_at AS latest_lead_at,
         count(*) OVER (PARTITION BY company_name_normalized) AS lead_count
       FROM leads
       WHERE ${scopeClause} ${searchClause}
       ORDER BY company_name_normalized, created_at DESC
     ) companies
     ORDER BY latest_lead_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}
