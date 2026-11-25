import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { countAuditByCategory, listAuditLogsPage } from "@/lib/audit/list";
import { AUDIT_CATEGORY_KEYS, AUDIT_PERIODS } from "@/lib/audit/categories";
import { parsePageParams } from "@/lib/pagination";

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  userId: z.coerce.number().int().positive().optional(),
  category: z.enum(AUDIT_CATEGORY_KEYS).optional(),
  period: z.enum(AUDIT_PERIODS).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({ q: url.searchParams.get("q") ?? undefined, userId: url.searchParams.get("userId") ?? undefined, category: url.searchParams.get("category") ?? undefined, period: url.searchParams.get("period") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const page = parsePageParams(url.searchParams);
  const { userId, period } = parsed.data;
  const [result, categoryCounts] = await Promise.all([listAuditLogsPage(pool, parsed.data, page), userId ? countAuditByCategory(pool, userId, period) : undefined]);
  return NextResponse.json({
    logs: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
    categoryCounts,
  });
}
