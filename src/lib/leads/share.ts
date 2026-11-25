import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { LeadActionNotAllowedError } from "./errors";
import { recordNotification } from "@/lib/notifications/record";

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
  const { rowCount } = await pool.query(
    "INSERT INTO lead_shares (lead_id, user_id, shared_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    [leadId, userId, actor.id],
  );
  if (rowCount) {
    const { rows: lead } = await pool.query<{ company_name: string }>("SELECT company_name FROM leads WHERE id = $1", [leadId]);
    // Reuses LEAD_ASSIGNED so no notifications-type migration is needed.
    await recordNotification(pool, { recipientUserId: userId, type: "LEAD_ASSIGNED", leadId, relatedUserId: actor.id, message: `${lead[0]?.company_name ?? "A lead"} was shared with you` });
  }
}

export async function unshareLead(pool: Pool, actor: { id: number; role: Role }, leadId: number, userId: number): Promise<void> {
  await assertLeadVisible(pool, actor, leadId, { requireOwner: true });
  await pool.query("DELETE FROM lead_shares WHERE lead_id = $1 AND user_id = $2", [leadId, userId]);
}

const MAX_BULK_SHARE_LEADS = 200;

// Shares every lead in `leadIds` with every user in `userIds`. All-or-nothing
// on permissions: if the actor doesn't own one of the leads, none are shared.
// Already-shared pairs are left alone.
export async function bulkShareLeads(
  pool: Pool,
  actor: { id: number; role: Role },
  leadIds: number[],
  userIds: number[],
): Promise<{ leads: number; users: number }> {
  const leads = [...new Set(leadIds)];
  const users = [...new Set(userIds)];
  if (leads.length === 0 || users.length === 0 || leads.length > MAX_BULK_SHARE_LEADS) {
    throw new LeadActionNotAllowedError(`Choose 1 to ${MAX_BULK_SHARE_LEADS} leads and at least one person`);
  }
  for (const leadId of leads) await assertLeadVisible(pool, actor, leadId, { requireOwner: true });

  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE id = ANY($1) AND status = 'ACTIVE' AND role IN ('MARKETING_HEAD', 'PRE_SALES', 'SALESPERSON')",
    [users],
  );
  if (rows.length !== users.length) {
    throw new LeadActionNotAllowedError("Every person must be an active user who can view leads");
  }
  await pool.query(
    `INSERT INTO lead_shares (lead_id, user_id, shared_by)
     SELECT l, u, $3 FROM unnest($1::bigint[]) AS l CROSS JOIN unnest($2::bigint[]) AS u
     ON CONFLICT DO NOTHING`,
    [leads, users, actor.id],
  );
  return { leads: leads.length, users: users.length };
}
