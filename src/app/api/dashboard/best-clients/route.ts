import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { SUMMARY_PERIODS } from "@/lib/dashboard/superAdminSummary";
import { getBestClients } from "@/lib/dashboard/topClients";

const querySchema = z.object({ period: z.enum(SUMMARY_PERIODS) });
const ALLOWED_ROLES = ["SUPER_ADMIN", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"];

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const parsed = querySchema.safeParse({ period: new URL(request.url).searchParams.get("period") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  // Only the super admin sees every client; everyone else sees their own.
  const clients = await getBestClients(pool, parsed.data.period, user.role === "SUPER_ADMIN" ? null : user.id);
  return NextResponse.json({ clients });
}
