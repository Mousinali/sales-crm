import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listPaymentsPage } from "@/lib/sales/payments";
import { SALE_PAYMENT_METHODS } from "@/lib/sales/types";
import { parsePageParams } from "@/lib/pagination";

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  method: z.enum(SALE_PAYMENT_METHODS).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    method: url.searchParams.get("method") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const page = parsePageParams(url.searchParams);
  const result = await listPaymentsPage(pool, user, parsed.data, page);
  return NextResponse.json({ payments: result.items, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
}
