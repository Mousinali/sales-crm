import type { Pool } from "pg";
import { leadVisibleSql } from "@/lib/leads/visibility";
import type { LeadRow } from "@/lib/leads/types";
import type { SaleRow } from "@/lib/sales/types";
import { CompanyNotFoundError } from "./errors";
import type { CompanySummary } from "./types";

export type CompanyPayment = {
  id: number;
  payment_number: string;
  sale_id: number;
  sale_number: string;
  amount: string;
  payment_method: string;
  payment_date: string;
  recorded_by_name: string | null;
};

// One row of the company's merged history: lead activity, visits, sales and
// payments, newest first. `activityType` is set for LEAD_ACTIVITY rows only.
export type CompanyActivityKind = "LEAD" | "LEAD_ACTIVITY" | "VISIT" | "SALE" | "PAYMENT";
export type CompanyActivity = {
  id: string;
  kind: CompanyActivityKind;
  activityType: string | null;
  at: Date;
  title: string;
  description: string | null;
  actor: string | null;
};

// A person this company is a client of: they own some of its leads (Pre-sales
// or Salesperson owner) and/or are credited with some of its sales.
export type CompanyOwner = { id: number; name: string; role: string; avatar_url: string | null; leads: number; sales: number };

// One lead moving between owners. Super Admin only (see getCompany's includeTransfers).
export type CompanyTransfer = {
  id: number;
  lead_id: number;
  lead_name: string | null;
  transferred_at: Date;
  reason: string;
  transferred_by: string | null;
  previous_pre_sales: string | null;
  new_pre_sales: string | null;
  previous_salesperson: string | null;
  new_salesperson: string | null;
};

export type CompanyDetail = {
  profile: CompanySummary;
  leads: LeadRow[];
  sales: SaleRow[];
  payments: CompanyPayment[];
  activity: CompanyActivity[];
  owners: CompanyOwner[];
  transfers: CompanyTransfer[];
};

const ACTIVITY_LIMIT = 100;

// Everything under one normalized company name: every lead ever recorded
// for it (profile = the most recent one), plus every sale against any of
// those leads — the same rollup listCompaniesPage summarizes, expanded.
// `includeLeads: false` (the Accountant) keeps lead records and lead activity
// out of the result — only sales and payments come back. Transfer history
// (and the TRANSFER entries in the activity feed) only comes back with
// `includeTransfers: true`, which only a Super Admin gets.
export async function getCompany(
  pool: Pool,
  companyNameNormalized: string,
  viewerId?: number,
  options: { includeLeads?: boolean; includeTransfers?: boolean } = {},
): Promise<CompanyDetail> {
  const includeLeads = options.includeLeads ?? true;
  const includeTransfers = includeLeads && (options.includeTransfers ?? false);
  // With a viewerId, only the leads that user can see (their own plus shared) count.
  const { rows: leads } = await pool.query<LeadRow>(
    `SELECT * FROM leads WHERE company_name_normalized = $1 ${viewerId === undefined ? "" : `AND ${leadVisibleSql("leads", "$2")}`} ORDER BY created_at DESC`,
    viewerId === undefined ? [companyNameNormalized] : [companyNameNormalized, viewerId],
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
    lead_source: latest.lead_source,
    lead_count: leads.length,
    latest_lead_at: latest.created_at,
  };

  const leadIds = leads.map((l) => l.id);
  const { rows: sales } = await pool.query<SaleRow>(
    `SELECT s.*, COALESCE((SELECT SUM(sp.amount) FROM sale_payments sp WHERE sp.sale_id = s.id), 0) AS paid_amount
     FROM sales s WHERE s.lead_id = ANY($1) ORDER BY s.created_at DESC`,
    [leadIds],
  );
  const saleIds = sales.map((s) => s.id);
  const saleParam = includeLeads ? "$2" : "$1";

  const [{ rows: payments }, { rows: activityRows }] = await Promise.all([
    pool.query<CompanyPayment>(
      `SELECT sp.id, sp.payment_number, sp.sale_id, s.sale_number, sp.amount, sp.payment_method, sp.payment_date,
              (SELECT name FROM users WHERE id = sp.recorded_by) AS recorded_by_name
       FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
       WHERE sp.sale_id = ANY($1) ORDER BY sp.payment_date DESC, sp.created_at DESC`,
      [saleIds],
    ),
    pool.query<{ id: string; kind: CompanyActivityKind; activity_type: string | null; at: Date; title: string; description: string | null; actor: string | null }>(
      `(SELECT 'sale-' || s.id AS id, 'SALE' AS kind, NULL::text AS activity_type, s.created_at AS at,
               'Sale ' || s.sale_number || ' recorded' AS title, '₹' || s.budget_amount::text AS description,
               (SELECT name FROM users WHERE id = s.created_by) AS actor
        FROM sales s WHERE s.id = ANY(${saleParam}))
       UNION ALL
       (SELECT 'pay-' || sp.id, 'PAYMENT', NULL, sp.created_at,
               '₹' || sp.amount::text || ' received for ' || s.sale_number, sp.payment_method || ' · ' || sp.payment_number,
               (SELECT name FROM users WHERE id = sp.recorded_by)
        FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id WHERE sp.sale_id = ANY(${saleParam}))
       ${
         includeLeads
           ? `UNION ALL
       (SELECT 'lead-' || l.id, 'LEAD', NULL, l.created_at, 'Lead recorded', COALESCE(l.contact_person, l.phone),
               (SELECT name FROM users WHERE id = l.created_by)
        FROM leads l WHERE l.id = ANY($1))
       UNION ALL
       (SELECT 'act-' || la.id, 'LEAD_ACTIVITY', la.type, la.created_at, initcap(replace(lower(la.type), '_', ' ')),
               la.notes, (SELECT name FROM users WHERE id = la.actor_user_id)
        FROM lead_activities la WHERE la.lead_id = ANY($1)${includeTransfers ? "" : " AND la.type <> 'TRANSFER'"})
       UNION ALL
       (SELECT 'visit-' || v.id, 'VISIT', NULL, v.created_at,
               'Client visit ' || lower(v.status) || ' for ' || to_char(v.visit_date, 'DD Mon YYYY'), v.objective,
               (SELECT name FROM users WHERE id = v.salesperson_id)
        FROM client_visits v WHERE v.lead_id = ANY($1))`
           : ""
       }
       ORDER BY at DESC LIMIT ${ACTIVITY_LIMIT}`,
      // Without lead activity the query never mentions $1, and pg refuses an unused parameter.
      includeLeads ? [leadIds, saleIds] : [saleIds],
    ),
  ]);

  const { rows: transfers } = includeTransfers
    ? await pool.query<CompanyTransfer>(
        `SELECT h.id, h.lead_id, COALESCE(l.contact_person, l.phone) AS lead_name, h.transferred_at, h.reason,
                (SELECT name FROM users WHERE id = h.transferred_by) AS transferred_by,
                (SELECT name FROM users WHERE id = h.previous_pre_sales_owner_id) AS previous_pre_sales,
                (SELECT name FROM users WHERE id = h.new_pre_sales_owner_id) AS new_pre_sales,
                (SELECT name FROM users WHERE id = h.previous_salesperson_owner_id) AS previous_salesperson,
                (SELECT name FROM users WHERE id = h.new_salesperson_owner_id) AS new_salesperson
         FROM lead_transfer_history h JOIN leads l ON l.id = h.lead_id
         WHERE h.lead_id = ANY($1) ORDER BY h.transferred_at DESC`,
        [leadIds],
      )
    : { rows: [] as CompanyTransfer[] };

  const activity = activityRows.map((r) => ({
    id: r.id, kind: r.kind, activityType: r.activity_type, at: r.at, title: r.title, description: r.description, actor: r.actor,
  }));

  // Who the client belongs to. Lead ownership is lead data, so the Accountant
  // (includeLeads: false) only gets the sales side.
  const tally = new Map<number, { leads: number; sales: number }>();
  const bump = (id: number | null | undefined, field: "leads" | "sales") => {
    if (id == null) return;
    const t = tally.get(id) ?? { leads: 0, sales: 0 };
    t[field] += 1;
    tally.set(id, t);
  };
  if (includeLeads) {
    for (const l of leads) {
      bump(l.pre_sales_owner_id, "leads");
      if (l.salesperson_owner_id !== l.pre_sales_owner_id) bump(l.salesperson_owner_id, "leads");
    }
  }
  // Same credit rule as the analysis pages: the "sold by" user, else whoever recorded it; custom names have no one.
  for (const sale of sales) bump(sale.sold_by_user_id ?? (sale.sold_by_type === "CUSTOM" ? null : sale.created_by), "sales");
  const { rows: people } = await pool.query<{ id: number; name: string; role: string; avatar_url: string | null }>(
    "SELECT id, name, role, avatar_url FROM users WHERE id = ANY($1)",
    [[...tally.keys()]],
  );
  const owners = people
    .map((u) => ({ ...u, ...tally.get(u.id)! }))
    .sort((a, b) => b.leads + b.sales - (a.leads + a.sales) || a.name.localeCompare(b.name));

  return { profile, leads, sales, payments, activity, owners, transfers };
}
