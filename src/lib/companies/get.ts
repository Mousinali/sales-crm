import type { Pool } from "pg";
import type { LeadRow } from "@/lib/leads/types";
import type { SaleRow } from "@/lib/sales/types";
import { CompanyNotFoundError } from "./errors";
import type { CompanySummary } from "./types";

export type CompanyDetail = {
  profile: CompanySummary;
  leads: LeadRow[];
  sales: SaleRow[];
};

// Everything under one normalized company name: every lead ever recorded
// for it (profile = the most recent one), plus every sale against any of
// those leads — the same rollup listCompaniesPage summarizes, expanded.
export async function getCompany(pool: Pool, companyNameNormalized: string): Promise<CompanyDetail> {
  const { rows: leads } = await pool.query<LeadRow>(
    `SELECT * FROM leads WHERE company_name_normalized = $1 ORDER BY created_at DESC`,
    [companyNameNormalized],
  );
  if (leads.length === 0) {
    throw new CompanyNotFoundError(`No company "${companyNameNormalized}"`);
  }

  const latest = leads[0];
  const profile: CompanySummary = {
    company_name_normalized: latest.company_name_normalized,
    company_name: latest.company_name,
    industry: latest.industry,
    business_type: latest.business_type,
    location: latest.location,
    address: latest.address,
    state: latest.state,
    pincode: latest.pincode,
    country: latest.country,
    phone: latest.phone,
    email: latest.email,
    website: latest.website,
    lead_count: leads.length,
    latest_lead_at: latest.created_at,
  };

  const leadIds = leads.map((l) => l.id);
  const { rows: sales } = await pool.query<SaleRow>(
    `SELECT * FROM sales WHERE lead_id = ANY($1) ORDER BY created_at DESC`,
    [leadIds],
  );

  return { profile, leads, sales };
}
