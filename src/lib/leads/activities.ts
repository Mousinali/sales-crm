import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { assertLeadVisible } from "./guard";

export type LeadActivityType = "NOTE" | "CALL" | "MEETING" | "OTHER" | "STATUS_CHANGE" | "ASSIGNMENT";

export type LeadActivityRow = {
  id: number;
  lead_id: number;
  actor_user_id: number;
  type: LeadActivityType;
  notes: string | null;
  created_at: Date;
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
    `SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC`,
    [leadId],
  );
  return rows;
}
