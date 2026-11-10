import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SALE_PAYMENT_METHODS } from "@/lib/sales/types";
import { recordSalePayment, listSalePayments } from "@/lib/sales/payments";
import { SaleNotFoundError, SaleNotAccessibleError } from "@/lib/sales/errors";

const createPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentMethod: z.enum(SALE_PAYMENT_METHODS),
  paymentDate: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

export async function POST(
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

  const body = await request.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const payment = await recordSalePayment(pool, { actorId: user.id, actorRole: user.role, saleId, ...parsed.data });
    return NextResponse.json(payment, { status: 201 });
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
    const payments = await listSalePayments(pool, user, saleId);
    return NextResponse.json({ payments });
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
