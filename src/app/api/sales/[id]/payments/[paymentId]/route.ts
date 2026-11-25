import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { amountSchema, dateSchema } from "@/lib/validation";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { updatePaymentFields } from "@/lib/sales/edit";
import { SaleActionNotAllowedError, SaleNotFoundError } from "@/lib/sales/errors";

const schema = z.object({ amount: amountSchema.optional(), date: dateSchema.optional() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; paymentId: string }> }): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, paymentId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(Number(id)) || !Number.isSafeInteger(Number(paymentId)) || !parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    await updatePaymentFields(pool, user, Number(id), Number(paymentId), parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SaleActionNotAllowedError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof SaleNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
