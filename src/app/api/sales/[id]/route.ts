import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { assertSaleVisible } from "@/lib/sales/guard";
import { listSaleServices } from "@/lib/sales/services";
import { listSalePayments } from "@/lib/sales/payments";
import { SaleNotFoundError, SaleNotAccessibleError } from "@/lib/sales/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isInteger(saleId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const sale = await assertSaleVisible(pool, user, saleId);
    const [services, payments] = await Promise.all([
      listSaleServices(pool, saleId),
      listSalePayments(pool, user, saleId),
    ]);
    const paidAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    return NextResponse.json({ ...sale, services, payments, paid_amount: String(paidAmount) });
  } catch (error) {
    if (error instanceof SaleNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof SaleNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
