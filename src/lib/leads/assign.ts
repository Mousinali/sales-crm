import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { LeadActionNotAllowedError } from "./errors";
import type { LeadRow } from "./types";
import { recordNotification } from "@/lib/notifications/record";

// Shared with transfer.ts's identical gate — a Salesperson can only be
// (re)assigned once a lead has actually been vetted, through to either
// closed outcome.
export const ASSIGNABLE_STATUSES = new Set(["QUALIFIED", "CONVERTED", "CLOSED_WON", "CLOSED_LOST"]);

// A readable "who changed to whom" sentence for the lead's Activity tab —
// the previous notes just dumped the new owner IDs (and only the new
// ones, so re-assigning the same salesperson looked identical to actually
// changing it), which is unreadable and tells a viewer nothing about what
// actually happened.
async function describeAssignmentChange(
  pool: Pool,
  change: {
    previousSalespersonOwnerId: number | null;
    newSalespersonOwnerId: number | null;
    previousPreSalesOwnerId: number | null;
    newPreSalesOwnerId: number | null;
  },
): Promise<string> {
  const ids = [
    change.previousSalespersonOwnerId,
    change.newSalespersonOwnerId,
    change.previousPreSalesOwnerId,
    change.newPreSalesOwnerId,
  ].filter((id): id is number => id !== null);

  const namesById = new Map<number, string>();
  if (ids.length > 0) {
    const { rows } = await pool.query<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = ANY($1::int[])", [ids]);
    for (const row of rows) namesById.set(row.id, row.name);
  }
  const nameOf = (id: number | null) => (id === null ? null : (namesById.get(id) ?? `user #${id}`));

  const parts: string[] = [];
  if (change.newSalespersonOwnerId !== change.previousSalespersonOwnerId) {
    parts.push(
      change.previousSalespersonOwnerId === null
        ? `Salesperson set to ${nameOf(change.newSalespersonOwnerId)}`
        : `Salesperson changed from ${nameOf(change.previousSalespersonOwnerId)} to ${nameOf(change.newSalespersonOwnerId)}`,
    );
  }
  if (change.newPreSalesOwnerId !== change.previousPreSalesOwnerId) {
    parts.push(
      change.previousPreSalesOwnerId === null
        ? `Pre-sales owner set to ${nameOf(change.newPreSalesOwnerId)}`
        : `Pre-sales owner changed from ${nameOf(change.previousPreSalesOwnerId)} to ${nameOf(change.newPreSalesOwnerId)}`,
    );
  }
  return parts.length > 0 ? parts.join("; ") : "Assignment confirmed (no ownership change)";
}

export async function assertActiveUserWithRole(pool: Pool, userId: number, role: Role): Promise<void> {
  const { rows } = await pool.query<{ role: Role; status: "ACTIVE" | "INACTIVE" }>(
    "SELECT role, status FROM users WHERE id = $1",
    [userId],
  );
  const target = rows[0];
  if (!target || target.status !== "ACTIVE" || target.role !== role) {
    throw new LeadActionNotAllowedError(`User ${userId} is not an active ${role}`);
  }
}

export async function assignLead(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    salespersonId?: number;
    preSalesOwnerId?: number;
  },
): Promise<LeadRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot assign leads`);
  }

  const lead = await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);
  // Only a Salesperson assignment is gated (req.md §6.1 step 5) — a lead
  // has to have been vetted before it's handed to a Salesperson at all.
  // Once it has (Qualified/Converted, or further on to a closed outcome —
  // a won/lost deal can still need its Salesperson corrected or handed
  // over), it stays assignable. Changing the Pre-sales owner has no such
  // gate — §3.3/§6.2 let a Marketing Head "change the Pre-sales owner when
  // needed" at any point, including on a lead that's still Pending Review.
  const requiresQualified = input.salespersonId !== undefined;
  if (requiresQualified && !ASSIGNABLE_STATUSES.has(lead.status)) {
    throw new LeadActionNotAllowedError(
      `Lead ${input.leadId} must be qualified, converted, or closed before it can be assigned a Salesperson (status: ${lead.status})`,
    );
  }

  if (input.salespersonId !== undefined) {
    await assertActiveUserWithRole(pool, input.salespersonId, "SALESPERSON");
  }
  if (input.preSalesOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.preSalesOwnerId, "PRE_SALES");
  }

  const client = await pool.connect();
  let previousSalespersonOwnerId: number | null;
  let previousPreSalesOwnerId: number | null;
  try {
    await client.query("BEGIN");

    // Re-read the real previous owners under a row lock, not the
    // pre-transaction `lead` read above — see transferLead's identical
    // comment for why a stale read here would compare notifications
    // against the wrong baseline under a race.
    const { rows: lockedRows } = await client.query<LeadRow>("SELECT * FROM leads WHERE id = $1 FOR UPDATE", [input.leadId]);
    previousSalespersonOwnerId = lockedRows[0].salesperson_owner_id;
    previousPreSalesOwnerId = lockedRows[0].pre_sales_owner_id;

    const { rows } = await client.query<LeadRow>(
      `UPDATE leads
       SET salesperson_owner_id = COALESCE($1, salesperson_owner_id),
           pre_sales_owner_id = COALESCE($2, pre_sales_owner_id),
           updated_at = now()
       WHERE id = $3 ${requiresQualified ? "AND status IN ('QUALIFIED', 'CONVERTED', 'CLOSED_WON', 'CLOSED_LOST')" : ""}
       RETURNING *`,
      [input.salespersonId ?? null, input.preSalesOwnerId ?? null, input.leadId],
    );
    const updatedLead = rows[0];
    if (!updatedLead) {
      // The status check above already passed, but the lead's status
      // changed between that read and this write (e.g. another Marketing
      // Head rejected it concurrently) — the WHERE clause is the real
      // guard against that race; the earlier check is just a fast path.
      throw new LeadActionNotAllowedError(`Lead ${input.leadId} is no longer in an assignable status`);
    }

    await client.query(
      `INSERT INTO lead_assignments (lead_id, pre_sales_owner_id, salesperson_owner_id, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [updatedLead.id, updatedLead.pre_sales_owner_id, updatedLead.salesperson_owner_id, input.actorId],
    );

    await client.query("COMMIT");

    await recordLeadActivity(pool, {
      leadId: input.leadId,
      actorId: input.actorId,
      type: "ASSIGNMENT",
      notes: await describeAssignmentChange(pool, {
        previousSalespersonOwnerId,
        newSalespersonOwnerId: updatedLead.salesperson_owner_id,
        previousPreSalesOwnerId,
        newPreSalesOwnerId: updatedLead.pre_sales_owner_id,
      }),
    });

    if (updatedLead.salesperson_owner_id !== null && updatedLead.salesperson_owner_id !== previousSalespersonOwnerId) {
      await recordNotification(pool, {
        recipientUserId: updatedLead.salesperson_owner_id,
        type: "LEAD_ASSIGNED",
        leadId: updatedLead.id,
        message: `You were assigned ${updatedLead.company_name}`,
      });
    }
    if (updatedLead.pre_sales_owner_id !== null && updatedLead.pre_sales_owner_id !== previousPreSalesOwnerId) {
      await recordNotification(pool, {
        recipientUserId: updatedLead.pre_sales_owner_id,
        type: "LEAD_ASSIGNED",
        leadId: updatedLead.id,
        message: `You were assigned ${updatedLead.company_name}`,
      });
    }

    return updatedLead;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
