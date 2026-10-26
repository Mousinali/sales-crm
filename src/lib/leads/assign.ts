import type { Pool } from "pg";
import type { Role } from "../auth/roles";
import { assertLeadVisible } from "./guard";
import { recordLeadActivity } from "./activities";
import { LeadActionNotAllowedError } from "./errors";
import type { LeadRow } from "./types";

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

  await assertLeadVisible(pool, { id: input.actorId, role: input.actorRole }, input.leadId);

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
       WHERE id = $3
       RETURNING *`,
      [input.salespersonId ?? null, input.preSalesOwnerId ?? null, input.leadId],
    );
    const lead = rows[0];

    await client.query(
      `INSERT INTO lead_assignments (lead_id, pre_sales_owner_id, salesperson_owner_id, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [lead.id, lead.pre_sales_owner_id, lead.salesperson_owner_id, input.actorId],
    );

    await client.query("COMMIT");

    await recordLeadActivity(pool, {
      leadId: input.leadId,
      actorId: input.actorId,
      type: "ASSIGNMENT",
      notes: `Assigned pre-sales owner ${lead.pre_sales_owner_id ?? "unchanged"}, salesperson ${lead.salesperson_owner_id ?? "unchanged"}`,
    });

    return lead;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
