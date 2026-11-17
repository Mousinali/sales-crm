import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { RANKING_RANGES, getEmployeeRanking } from "@/lib/dashboard/topClients";

const querySchema = z.object({ range: z.enum(RANKING_RANGES) });

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = querySchema.safeParse({ range: new URL(request.url).searchParams.get("range") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  return NextResponse.json({ employees: await getEmployeeRanking(pool, parsed.data.range) });
}
