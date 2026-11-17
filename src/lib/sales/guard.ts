import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { SaleNotFoundError, SaleNotAccessibleError } from "./errors";
import { leadVisibleSql } from "@/lib/leads/visibility";
import type { SaleRow } from "./types";

// Super Admin and Accountant see every sale; Marketing Head, Pre-sales and
// Salesperson see the ones they recorded, were credited with, or whose lead
// they can see.
export async function assertSaleVisible(pool: Pool, viewer: { id: number; role: Role }, saleId: number): Promise<SaleRow> {
  const { rows } = await pool.query<SaleRow>("SELECT * FROM sales WHERE id = $1", [saleId]);
  const sale = rows[0];
  if (!sale) {
    throw new SaleNotFoundError(`No sale with id ${saleId}`);
  }

  if (viewer.role === "SUPER_ADMIN" || viewer.role === "ACCOUNTANT") {
    return sale;
  }
  if (viewer.role === "MARKETING_HEAD" || viewer.role === "PRE_SALES" || viewer.role === "SALESPERSON") {
    if (sale.created_by === viewer.id || sale.sold_by_user_id === viewer.id) {
      return sale;
    }
    // Same rule as the lists: whoever can see the sale's lead (owner, creator
    // or shared with) can see the sale and its payments.
    if (sale.lead_id != null) {
      const { rows: leadRows } = await pool.query(
        `SELECT 1 FROM leads l WHERE l.id = $2 AND ${leadVisibleSql("l", "$1")}`,
        [viewer.id, sale.lead_id],
      );
      if (leadRows.length > 0) return sale;
    }
    throw new SaleNotAccessibleError(`${viewer.role} ${viewer.id} cannot access sale ${saleId}`);
  }

  throw new SaleNotAccessibleError(`${viewer.role} cannot access sales`);
}
