import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { LeadActionNotAllowedError } from "./errors";

export type LeadShareRow = { user_id: number; name: string; role: Role };

// Only someone who owns the lead (or a Super Admin) can see or change who
// it's shared with.
export async function listLeadShares(pool: Pool, viewer: { id: number; role: Role }, leadId: number): Promise<LeadShareRow[]> {
  await assertLeadVisible(pool, viewer, leadId, { requireOwner: true });
  const { rows } = await pool.query<LeadShareRow>(
    `SELECT ls.user_id, u.name, u.role FROM lead_shares ls JOIN users u ON u.id = ls.user_id WHERE ls.lead_id = $1 ORDER BY u.name`,
    [leadId],
  );
  return rows;
}

export async function shareLead(pool: Pool, actor: { id: number; role: Role }, leadId: number, userId: number): Promise<void> {
  await assertLeadVisible(pool, actor, leadId, { requireOwner: true });
  const { rows } = await pool.query(
    "SELECT 1 FROM users WHERE id = $1 AND status = 'ACTIVE' AND role IN ('MARKETING_HEAD', 'PRE_SALES', 'SALESPERSON')",
    [userId],
  );
  if (rows.length === 0) {
    throw new LeadActionNotAllowedError(`User ${userId} is not an active user who can view leads`);
  }
  await pool.query(
    "INSERT INTO lead_shares (lead_id, user_id, shared_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [leadId, userId, actor.id],
  );
}

export async function unshareLead(pool: Pool, actor: { id: number; role: Role }, leadId: number, userId: number): Promise<void> {
  await assertLeadVisible(pool, actor, leadId, { requireOwner: true });
  await pool.query("DELETE FROM lead_shares WHERE lead_id = $1 AND user_id = $2", [leadId, userId]);
}
