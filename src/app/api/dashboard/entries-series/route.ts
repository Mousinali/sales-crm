import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getEntriesTimeSeries, ENTRIES_METRICS, ENTRIES_PERIODS } from "@/lib/dashboard/entriesTimeSeries";

const querySchema = z.object({
  metric: z.enum(ENTRIES_METRICS),
  period: z.enum(ENTRIES_PERIODS),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    metric: url.searchParams.get("metric") ?? undefined,
    period: url.searchParams.get("period") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // The Accountant only gets the money series; lead/sale counts stay with Super Admin and Marketing Head.
  const isOwnScoped = user.role === "SALESPERSON" || user.role === "PRE_SALES";
  const allowed =
    user.role === "SUPER_ADMIN" ||
    user.role === "MARKETING_HEAD" ||
    (user.role === "ACCOUNTANT" && (parsed.data.metric === "SALES_AMOUNT" || parsed.data.metric === "PAYMENTS_AMOUNT")) ||
    // Sales people / Pre-sales get a chart of just their own leads and sales,
    // plus the payments they recorded themselves.
    (isOwnScoped && (parsed.data.metric === "LEADS" || parsed.data.metric === "SALES" || parsed.data.metric === "PAYMENTS"));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const points = await getEntriesTimeSeries(pool, parsed.data.metric, parsed.data.period, isOwnScoped ? user.id : undefined);
  return NextResponse.json({ points });
}
