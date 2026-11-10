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

  return <SaleDetailView sale={sale} services={services} initialPayments={payments} />;
}
