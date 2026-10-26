import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { LeadNotFoundError, LeadNotAccessibleError } from "./errors";
import type { LeadRow } from "./types";

export async function assertLeadVisible(
  pool: Pool,
  viewer: { id: number; role: Role },
  leadId: number,
): Promise<LeadRow> {
  const { rows } = await pool.query<LeadRow>("SELECT * FROM leads WHERE id = $1", [leadId]);
  const lead = rows[0];
  if (!lead) {
    throw new LeadNotFoundError(`No lead with id ${leadId}`);
  }

  if (viewer.role === "SUPER_ADMIN" || viewer.role === "MARKETING_HEAD") {
    return lead;
  }
  if (viewer.role === "PRE_SALES") {
    if (lead.created_by === viewer.id || lead.pre_sales_owner_id === viewer.id) {
      return lead;
    }
    throw new LeadNotAccessibleError(`PRE_SALES ${viewer.id} cannot access lead ${leadId}`);
  }
  if (viewer.role === "SALESPERSON") {
    if (lead.salesperson_owner_id === viewer.id) {
      return lead;
    }
    throw new LeadNotAccessibleError(`SALESPERSON ${viewer.id} cannot access lead ${leadId}`);
  }

  throw new LeadNotAccessibleError(`${viewer.role} cannot access leads`);
}
