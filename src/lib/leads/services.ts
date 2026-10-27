import type { Pool } from "pg";
import type { ServiceRow } from "@/lib/services/types";

export async function setLeadServices(pool: Pool, input: { leadId: number; serviceIds: number[] }): Promise<void> {
  await pool.query("DELETE FROM lead_services WHERE lead_id = $1", [input.leadId]);
  if (input.serviceIds.length === 0) return;

  const values = input.serviceIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`INSERT INTO lead_services (lead_id, service_id) VALUES ${values}`, [input.leadId, ...input.serviceIds]);
}

export async function listLeadServices(pool: Pool, leadId: number): Promise<ServiceRow[]> {
  const { rows } = await pool.query<ServiceRow>(
    `SELECT s.* FROM services s JOIN lead_services ls ON ls.service_id = s.id WHERE ls.lead_id = $1 ORDER BY s.name`,
    [leadId],
  );
  return rows;
}
