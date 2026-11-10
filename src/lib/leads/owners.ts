import type { Pool } from "pg";

export type LeadOwnerNames = {
  preSalesOwnerName: string | null;
  salespersonOwnerName: string | null;
  createdByName: string | null;
};

// The lead detail page's Assignment tab needs to show who's currently
// assigned (not just offer a form to change it), and its header needs who
// created the lead — this resolves all three ids to names in one query.
export async function getLeadOwnerNames(
  pool: Pool,
  lead: { pre_sales_owner_id: number | null; salesperson_owner_id: number | null; created_by: number },
): Promise<LeadOwnerNames> {
  const ids = [lead.pre_sales_owner_id, lead.salesperson_owner_id, lead.created_by].filter(
    (id): id is number => id != null,
  );

  const { rows } = await pool.query<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = ANY($1)", [ids]);
  const nameById = new Map(rows.map((r) => [r.id, r.name]));
  return {
    preSalesOwnerName: lead.pre_sales_owner_id != null ? (nameById.get(lead.pre_sales_owner_id) ?? null) : null,
    salespersonOwnerName: lead.salesperson_owner_id != null ? (nameById.get(lead.salesperson_owner_id) ?? null) : null,
    createdByName: nameById.get(lead.created_by) ?? null,
  };
}
