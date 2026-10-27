import type { Pool } from "pg";
import type { ServiceRow } from "@/lib/services/types";
import { LeadActionNotAllowedError } from "./errors";

export async function setLeadServices(pool: Pool, input: { leadId: number; serviceIds: number[] }): Promise<void> {
  const uniqueIds = Array.from(new Set(input.serviceIds));

  if (uniqueIds.length > 0) {
    const { rows: currentRows } = await pool.query<{ service_id: number }>(
      "SELECT service_id FROM lead_services WHERE lead_id = $1",
      [input.leadId],
    );
    const alreadyAttached = new Set(currentRows.map((r) => r.service_id));
    // A service already on this lead may stay even if it's since gone
    // INACTIVE (e.g. resubmitting the edit form after a Super Admin
    // deactivated it) — only a newly added id must be an existing, ACTIVE
    // service. This is what "deactivated services are hidden from new
    // selections" (req.md §5.1) actually requires at the data layer, not
    // just in the UI's dropdown.
    const newIds = uniqueIds.filter((id) => !alreadyAttached.has(id));
    if (newIds.length > 0) {
      const { rows: validRows } = await pool.query<{ id: number }>(
        "SELECT id FROM services WHERE id = ANY($1) AND status = 'ACTIVE'",
        [newIds],
      );
      if (validRows.length !== newIds.length) {
        throw new LeadActionNotAllowedError("One or more selected services are invalid or inactive");
      }
    }
  }

  await pool.query("DELETE FROM lead_services WHERE lead_id = $1", [input.leadId]);
  if (uniqueIds.length === 0) return;

  const values = uniqueIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`INSERT INTO lead_services (lead_id, service_id) VALUES ${values}`, [input.leadId, ...uniqueIds]);
}

export async function listLeadServices(pool: Pool, leadId: number): Promise<ServiceRow[]> {
  const { rows } = await pool.query<ServiceRow>(
    `SELECT s.* FROM services s JOIN lead_services ls ON ls.service_id = s.id WHERE ls.lead_id = $1 ORDER BY s.name`,
    [leadId],
  );
  return rows;
}
