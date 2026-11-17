import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { DIMENSIONS, METRICS, getPerformance } from "@/lib/analysis/performance";
import { parsePageParams } from "@/lib/pagination";
import { RANKING_RANGES } from "@/lib/dashboard/topClients";

const querySchema = z.object({
  metric: z.enum(METRICS),
  dimension: z.enum(DIMENSIONS),
  range: z.enum(RANKING_RANGES),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    metric: params.get("metric") ?? undefined,
    dimension: params.get("dimension") ?? undefined,
    range: params.get("range") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { metric, dimension, range } = parsed.data;
  return NextResponse.json(await getPerformance(pool, metric, dimension, range, parsePageParams(params)));
}
