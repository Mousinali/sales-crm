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
  if (user.role !== "SUPER_ADMIN" && user.role !== "MARKETING_HEAD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    metric: url.searchParams.get("metric") ?? undefined,
    period: url.searchParams.get("period") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const points = await getEntriesTimeSeries(pool, parsed.data.metric, parsed.data.period);
  return NextResponse.json({ points });
}
