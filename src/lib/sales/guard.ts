import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { SaleNotFoundError, SaleNotAccessibleError } from "./errors";
import type { SaleRow } from "./types";

// Mirrors leads/guard.ts's assertLeadVisible: Marketing Head (and Super
// Admin) can see every sale; a Pre-sales or Salesperson only the ones they
// recorded or were credited with.
export async function assertSaleVisible(pool: Pool, viewer: { id: number; role: Role }, saleId: number): Promise<SaleRow> {
  const { rows } = await pool.query<SaleRow>("SELECT * FROM sales WHERE id = $1", [saleId]);
  const sale = rows[0];
  if (!sale) {
    throw new SaleNotFoundError(`No sale with id ${saleId}`);
  }

  if (viewer.role === "SUPER_ADMIN" || viewer.role === "MARKETING_HEAD") {
    return sale;
  }
  if (viewer.role === "PRE_SALES" || viewer.role === "SALESPERSON") {
    if (sale.created_by === viewer.id || sale.sold_by_user_id === viewer.id) {
      return sale;
    }
    throw new SaleNotAccessibleError(`${viewer.role} ${viewer.id} cannot access sale ${saleId}`);
  }

  throw new SaleNotAccessibleError(`${viewer.role} cannot access sales`);
}
