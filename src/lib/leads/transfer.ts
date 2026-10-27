import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { assertActiveUserWithRole } from "./assign";
import { LeadActionNotAllowedError, InvalidLeadReasonError } from "./errors";
import type { LeadRow } from "./types";
import { recordNotification } from "@/lib/notifications/record";

async function notifyChangedOwners(
  pool: Pool,
  lead: LeadRow,
  updatedLead: LeadRow,
): Promise<void> {
  const message = `${lead.company_name} was transferred`;
  for (const [previous, current] of [
    [lead.salesperson_owner_id, updatedLead.salesperson_owner_id],
    [lead.pre_sales_owner_id, updatedLead.pre_sales_owner_id],
  ] as const) {
    if (current === previous) continue;
    if (previous !== null) {
      await recordNotification(pool, { recipientUserId: previous, type: "LEAD_TRANSFERRED", leadId: updatedLead.id, message });
    }
    if (current !== null) {
      await recordNotification(pool, { recipientUserId: current, type: "LEAD_TRANSFERRED", leadId: updatedLead.id, message });
    }
  }
}

export async function transferLead(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadId: number;
    newPreSalesOwnerId?: number;
    newSalespersonOwnerId?: number;
    reason: string;
  },
): Promise<LeadRow> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot transfer leads`);
  }
  if (!input.reason.trim()) {
    throw new InvalidLeadReasonError("A reason is required to transfer a lead");
  }

  const lead = await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);

  if (input.newSalespersonOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.newSalespersonOwnerId, "SALESPERSON");
  }
  if (input.newPreSalesOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.newPreSalesOwnerId, "PRE_SALES");
  }

  const client = await pool.connect();
  let updatedLead: LeadRow;
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<LeadRow>(
      `UPDATE leads
       SET salesperson_owner_id = COALESCE($1, salesperson_owner_id),
           pre_sales_owner_id = COALESCE($2, pre_sales_owner_id),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [input.newSalespersonOwnerId ?? null, input.newPreSalesOwnerId ?? null, input.leadId],
    );
    updatedLead = rows[0];

    await client.query(
      `INSERT INTO lead_transfer_history
         (lead_id, previous_pre_sales_owner_id, previous_salesperson_owner_id, new_pre_sales_owner_id, new_salesperson_owner_id, transferred_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        updatedLead.id,
        lead.pre_sales_owner_id,
        lead.salesperson_owner_id,
        updatedLead.pre_sales_owner_id,
        updatedLead.salesperson_owner_id,
        input.actorId,
        input.reason,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  await recordLeadActivity(pool, {
    leadId: input.leadId,
    actorId: input.actorId,
    type: "TRANSFER",
    notes: input.reason,
  });
  await notifyChangedOwners(pool, lead, updatedLead);

  return updatedLead;
}

export async function bulkTransferLeads(
  pool: Pool,
  input: {
    actorId: number;
    actorRole: Role;
    leadIds: number[];
    newPreSalesOwnerId?: number;
    newSalespersonOwnerId?: number;
    reason: string;
  },
): Promise<LeadRow[]> {
  if (input.actorRole !== "MARKETING_HEAD") {
    throw new LeadActionNotAllowedError(`${input.actorRole} cannot transfer leads`);
  }
  if (!input.reason.trim()) {
    throw new InvalidLeadReasonError("A reason is required to transfer a lead");
  }

  if (input.newSalespersonOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.newSalespersonOwnerId, "SALESPERSON");
  }
  if (input.newPreSalesOwnerId !== undefined) {
    await assertActiveUserWithRole(pool, input.newPreSalesOwnerId, "PRE_SALES");
  }

  const previousLeads: LeadRow[] = [];
  for (const leadId of input.leadIds) {
    previousLeads.push(await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, leadId));
  }

  const client = await pool.connect();
  const updatedLeads: LeadRow[] = [];
  try {
    await client.query("BEGIN");

    for (const lead of previousLeads) {
      const { rows } = await client.query<LeadRow>(
        `UPDATE leads
         SET salesperson_owner_id = COALESCE($1, salesperson_owner_id),
             pre_sales_owner_id = COALESCE($2, pre_sales_owner_id),
             updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [input.newSalespersonOwnerId ?? null, input.newPreSalesOwnerId ?? null, lead.id],
      );
      const updatedLead = rows[0];
      updatedLeads.push(updatedLead);

      await client.query(
        `INSERT INTO lead_transfer_history
           (lead_id, previous_pre_sales_owner_id, previous_salesperson_owner_id, new_pre_sales_owner_id, new_salesperson_owner_id, transferred_by, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          updatedLead.id,
          lead.pre_sales_owner_id,
          lead.salesperson_owner_id,
          updatedLead.pre_sales_owner_id,
          updatedLead.salesperson_owner_id,
          input.actorId,
          input.reason,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  for (let i = 0; i < updatedLeads.length; i++) {
    await recordLeadActivity(pool, {
      leadId: previousLeads[i].id,
      actorId: input.actorId,
      type: "TRANSFER",
      notes: input.reason,
    });
    await notifyChangedOwners(pool, previousLeads[i], updatedLeads[i]);
  }

  return updatedLeads;
}
