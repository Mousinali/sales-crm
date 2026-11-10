import type { Pool } from "pg";

export type LatestSaleSummary = { id: number; budget_amount: string; paid_amount: string };

// Single-lead counterpart of leads/list.ts's LATEST_SALE_JOIN — same "most
// recent sale, paid summed from its payments" shape, for the one-lead GET
// routes that don't go through listLeads/listLeadsPage.
export async function getLatestSaleForLead(pool: Pool, leadId: number): Promise<LatestSaleSummary | null> {
  const { rows } = await pool.query<LatestSaleSummary>(
    `SELECT s.id, s.budget_amount,
            COALESCE((SELECT SUM(amount) FROM sale_payments WHERE sale_payments.sale_id = s.id), 0) AS paid_amount
     FROM sales s
     WHERE s.lead_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [leadId],
  );
  return rows[0] ?? null;
}
