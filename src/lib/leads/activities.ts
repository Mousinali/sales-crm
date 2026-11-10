import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";

export type LeadActivityType = "NOTE" | "CALL" | "MEETING" | "OTHER" | "STATUS_CHANGE" | "ASSIGNMENT" | "TRANSFER" | "CLIENT_VISIT";

export type LeadActivityRow = {
  id: number;
  lead_id: number;
  actor_user_id: number;
  type: LeadActivityType;
  notes: string | null;
  created_at: Date;
  // Only present on rows from listLeadActivities (joined in there) — who
  // performed it, for the lead detail page's timeline.
  actor_name?: string;
};

export async function recordLeadActivity(
  pool: Pool,
  input: { leadId: number; actorId: number; type: LeadActivityType; notes?: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO lead_activities (lead_id, actor_user_id, type, notes) VALUES ($1, $2, $3, $4)`,
    [input.leadId, input.actorId, input.type, input.notes ?? null],
  );
}

export async function listLeadActivities(
  pool: Pool,
  viewer: { id: number; role: Role },
  leadId: number,
): Promise<LeadActivityRow[]> {
  await assertLeadVisible(pool, viewer, leadId);

  const { rows } = await pool.query<LeadActivityRow>(
    `SELECT la.*, u.name AS actor_name FROM lead_activities la
     JOIN users u ON u.id = la.actor_user_id
     WHERE la.lead_id = $1 ORDER BY la.created_at DESC`,
    [leadId],
  );
  return rows;
}
