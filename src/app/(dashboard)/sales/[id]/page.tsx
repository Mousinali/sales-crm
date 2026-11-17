import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { assertSaleVisible } from "@/lib/sales/guard";
import { listSaleServices } from "@/lib/sales/services";
import { listSalePayments } from "@/lib/sales/payments";
import { SaleNotFoundError, SaleNotAccessibleError } from "@/lib/sales/errors";
import SaleDetailView from "./SaleDetailView";

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isInteger(saleId)) {
    notFound();
  }

  let sale;
  try {
    sale = await assertSaleVisible(pool, user, saleId);
  } catch (error) {
    if (error instanceof SaleNotFoundError || error instanceof SaleNotAccessibleError) notFound();
    throw error;
  }

  const [services, payments] = await Promise.all([
    listSaleServices(pool, sale.id),
    listSalePayments(pool, user, sale.id),
  ]);

  // The guard returns the bare sales row, so resolve the display names here.
  const { rows } = await pool.query<{ sold_by: string | null; recorded_by: string | null }>(
    `SELECT CASE s.sold_by_type WHEN 'CUSTOM' THEN s.sold_by_custom_name ELSE COALESCE(su.name, cu.name) END AS sold_by, cu.name AS recorded_by
     FROM sales s LEFT JOIN users su ON su.id = s.sold_by_user_id LEFT JOIN users cu ON cu.id = s.created_by WHERE s.id = $1`,
    [sale.id],
  );

  return (
    <SaleDetailView
      sale={sale}
      services={services}
      initialPayments={payments}
      soldByName={rows[0]?.sold_by ?? null}
      recordedByName={rows[0]?.recorded_by ?? null}
    />
  );
}
