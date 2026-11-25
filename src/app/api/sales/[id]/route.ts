import { NextResponse } from "next/server";
import { z } from "zod";
import { updateSaleFields } from "@/lib/sales/edit";
import { SaleActionNotAllowedError } from "@/lib/sales/errors";
import { pool } from "@/lib/db";
import { amountSchema, dateSchema } from "@/lib/validation";
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
  if (!Number.isSafeInteger(saleId)) {
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

const patchSchema = z.object({ amount: amountSchema.optional(), date: dateSchema.optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const saleId = Number((await params).id);
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(saleId) || !parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    await updateSaleFields(pool, user, saleId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SaleActionNotAllowedError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof SaleNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
