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
    // A Marketing Head can schedule a client visit for a salesperson on a
    // lead that salesperson doesn't (yet) own — e.g. introducing them to an
    // account before a formal transfer. That visit still needs to open to
    // somewhere, so having a visit on this lead also grants visibility.
    const { rows: visitRows } = await pool.query(
      "SELECT 1 FROM client_visits WHERE lead_id = $1 AND salesperson_id = $2 LIMIT 1",
      [leadId, viewer.id],
    );
    if (visitRows.length > 0) {
      return lead;
    }
    throw new LeadNotAccessibleError(`SALESPERSON ${viewer.id} cannot access lead ${leadId}`);
  }

  throw new LeadNotAccessibleError(`${viewer.role} cannot access leads`);
}
