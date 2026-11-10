import type { Pool } from "pg";
import type { ServiceRow } from "@/lib/services/types";
import { SaleActionNotAllowedError } from "./errors";

// Mirrors leads/services.ts's setLeadServices/listLeadServices exactly —
// same shape, same "new ids must be active" rule — for the sale's own
// service-interested selection.
export async function setSaleServices(pool: Pool, input: { saleId: number; serviceIds: number[] }): Promise<void> {
  const uniqueIds = Array.from(new Set(input.serviceIds));

  if (uniqueIds.length > 0) {
    const { rows: validRows } = await pool.query<{ id: number }>(
      "SELECT id FROM services WHERE id = ANY($1) AND status = 'ACTIVE'",
      [uniqueIds],
    );
    if (validRows.length !== uniqueIds.length) {
      throw new SaleActionNotAllowedError("One or more selected services are invalid or inactive");
    }
  }

  await pool.query("DELETE FROM sale_services WHERE sale_id = $1", [input.saleId]);
  if (uniqueIds.length === 0) return;

  const values = uniqueIds.map((_, i) => `($1, $${i + 2})`).join(", ");
  await pool.query(`INSERT INTO sale_services (sale_id, service_id) VALUES ${values}`, [input.saleId, ...uniqueIds]);
}

export async function listSaleServices(pool: Pool, saleId: number): Promise<ServiceRow[]> {
  const { rows } = await pool.query<ServiceRow>(
    `SELECT s.* FROM services s JOIN sale_services ss ON ss.service_id = s.id WHERE ss.sale_id = $1 ORDER BY s.name`,
    [saleId],
  );
  return rows;
}
