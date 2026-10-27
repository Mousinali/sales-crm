import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { LeadActionNotAllowedError } from "./errors";
import type { LeadRow } from "./types";
import { recordNotification } from "@/lib/notifications/record";

async function assertActiveUserWithRole(pool: Pool, userId: number, role: Role): Promise<void> {
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
  // Only a Salesperson assignment is gated on Qualified/Converted (req.md
  // §6.1 step 5). Changing the Pre-sales owner has no such gate — §3.3/§6.2
  // let a Marketing Head "change the Pre-sales owner when needed" at any
  // point, including on a lead that's still Pending Review.
  const requiresQualified = input.salespersonId !== undefined;
  if (requiresQualified && lead.status !== "QUALIFIED" && lead.status !== "CONVERTED") {
    throw new LeadActionNotAllowedError(
      `Lead ${input.leadId} must be qualified or converted before it can be assigned a Salesperson (status: ${lead.status})`,
    );
  }

  if (input.salespersonId !== undefined) {
    await assertActiveUserWithRole(pool, input.salespersonId, "SALESPERSON");
  }
  if (input.preSalesOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.preSalesOwnerId, "PRE_SALES");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<LeadRow>(
      `UPDATE leads
       SET salesperson_owner_id = COALESCE($1, salesperson_owner_id),
           pre_sales_owner_id = COALESCE($2, pre_sales_owner_id),
           updated_at = now()
       WHERE id = $3 ${requiresQualified ? "AND status IN ('QUALIFIED', 'CONVERTED')" : ""}
       RETURNING *`,
      [input.salespersonId ?? null, input.preSalesOwnerId ?? null, input.leadId],
    );
    const updatedLead = rows[0];
    if (!updatedLead) {
      // The status check above already passed, but the lead's status
      // changed between that read and this write (e.g. another Marketing
      // Head rejected it concurrently) — the WHERE clause is the real
      // guard against that race; the earlier check is just a fast path.
      throw new LeadActionNotAllowedError(`Lead ${input.leadId} is no longer qualified or converted`);
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
      notes: `Assigned pre-sales owner ${updatedLead.pre_sales_owner_id ?? "unchanged"}, salesperson ${updatedLead.salesperson_owner_id ?? "unchanged"}`,
    });

    if (updatedLead.salesperson_owner_id !== null && updatedLead.salesperson_owner_id !== lead.salesperson_owner_id) {
      await recordNotification(pool, {
        recipientUserId: updatedLead.salesperson_owner_id,
        type: "LEAD_ASSIGNED",
        leadId: updatedLead.id,
        message: `You were assigned ${updatedLead.company_name}`,
      });
    }
    if (updatedLead.pre_sales_owner_id !== null && updatedLead.pre_sales_owner_id !== lead.pre_sales_owner_id) {
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
