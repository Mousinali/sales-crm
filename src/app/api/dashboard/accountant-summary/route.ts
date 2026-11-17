import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SUMMARY_PERIODS } from "@/lib/dashboard/superAdminSummary";
import { getAccountantSummary } from "@/lib/dashboard/accountantSummary";

const querySchema = z.object({ period: z.enum(SUMMARY_PERIODS) });

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "ACCOUNTANT" && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse({ period: new URL(request.url).searchParams.get("period") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  return NextResponse.json(await getAccountantSummary(pool, parsed.data.period));
}
