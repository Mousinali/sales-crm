import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { canActOnLeads } from "./assign";
import { LeadActionNotAllowedError, InvalidLeadReasonError } from "./errors";
import type { LeadRow, LeadStatus } from "./types";

// Moving a lead to one of these closes it out the wrong way, so say why.
const REASON_REQUIRED = new Set<LeadStatus>(["REJECTED", "CLOSED_LOST", "MORE_INFO_REQUIRED"]);

// Anyone who can see a lead — its owners, or a user it was shared with — can
// move it to any status; there is no separate review step.
export async function setLeadStatus(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    status: LeadStatus;
    reason?: string;
  },
): Promise<LeadRow> {
  if (!canActOnLeads(input.actorRole)) {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot change lead status`);
  }

  await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);

  if (REASON_REQUIRED.has(input.status) && !input.reason?.trim()) {
    throw new InvalidLeadReasonError(`A reason is required to move a lead to ${input.status}`);
  }

  const { rows } = await pool.query<LeadRow>(
    `UPDATE leads SET status = $1, status_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [input.status, input.reason ?? null, input.leadId],
  );

  await recordLeadActivity(pool, {
    leadId: input.leadId,
    actorId: input.actorId,
    type: "STATUS_CHANGE",
    notes: input.reason ?? input.status,
  });

  return rows[0];
}
