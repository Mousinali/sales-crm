import type { Pool } from "pg";
import type { SaleBudgetType } from "./types";

export type SaleLeadOption = {
  id: number;
  company_name: string;
  contact_person: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  estimated_budget: string | null;
  budget_type: SaleBudgetType | null;
  service_ids: number[];
};

// What an Accountant is allowed to know about a lead: just enough to prefill
// a sale — they can't open or list leads otherwise.
// shortcut: capped at 500 most recent leads, no search; add a type-ahead if that runs out.
export async function listSaleLeadOptions(pool: Pool): Promise<SaleLeadOption[]> {
  const { rows } = await pool.query<SaleLeadOption>(
    `SELECT l.id, l.company_name, l.contact_person, l.phone, l.email, l.address, l.estimated_budget, l.budget_type,
            COALESCE((SELECT array_agg(service_id) FROM lead_services WHERE lead_id = l.id), '{}') AS service_ids
     FROM leads l
     WHERE l.archived_at IS NULL AND l.status NOT IN ('REJECTED', 'CLOSED_LOST')
     ORDER BY l.created_at DESC LIMIT 500`,
  );
  return rows;
}
