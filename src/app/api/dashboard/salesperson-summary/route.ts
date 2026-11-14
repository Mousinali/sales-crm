import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getSalespersonPeriodSummary } from "@/lib/dashboard/salespersonSummary";
import { SUMMARY_PERIODS } from "@/lib/dashboard/superAdminSummary";

const querySchema = z.object({ period: z.enum(SUMMARY_PERIODS) });

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "SALESPERSON") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ period: url.searchParams.get("period") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const summary = await getSalespersonPeriodSummary(pool, user.id, parsed.data.period);
  return NextResponse.json(summary);
}
