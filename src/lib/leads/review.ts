import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { LeadActionNotAllowedError, InvalidLeadReasonError } from "./errors";
import type { LeadRow } from "./types";

const NEW_STATUS: Record<"QUALIFY" | "REJECT" | "RETURN", LeadRow["status"]> = {
  QUALIFY: "QUALIFIED",
  REJECT: "REJECTED",
  RETURN: "MORE_INFO_REQUIRED",
};

export async function reviewLead(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    action: "QUALIFY" | "REJECT" | "RETURN";
    reason?: string;
  },
): Promise<LeadRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot review leads`);
  }

  const lead = await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);

  if (lead.status !== "PENDING_REVIEW" && lead.status !== "MORE_INFO_REQUIRED") {
    throw new LeadActionNotAllowedError(`Lead ${input.leadId} is not awaiting review (status: ${lead.status})`);
  }

  if ((input.action === "REJECT" || input.action === "RETURN") && !input.reason?.trim()) {
    throw new InvalidLeadReasonError(`A reason is required to ${input.action.toLowerCase()} a lead`);
  }

  const { rows } = await pool.query<LeadRow>(
    `UPDATE leads SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [NEW_STATUS[input.action], input.reason ?? null, input.leadId],
  );

  await recordLeadActivity(pool, {
    leadId: input.leadId,
    actorId: input.actorId,
    type: "STATUS_CHANGE",
    notes: input.reason ?? input.action,
  });

  return rows[0];
}
