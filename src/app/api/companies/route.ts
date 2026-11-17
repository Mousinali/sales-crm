import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listCompaniesPage, viewerScope } from "@/lib/companies/list";
import { parsePageParams } from "@/lib/pagination";

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  archived: z.literal("true").optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Super Admin and Accountant see every company; Marketing Head, Pre-sales and
  // Salesperson see the ones behind leads they can see. HR sees none.
  if (user.role === "HR") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    archived: url.searchParams.get("archived") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // The Archive page (archived companies) is Super-Admin-only.
  if (parsed.data.archived && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = parsePageParams(url.searchParams);
  const result = await listCompaniesPage(pool, { q: parsed.data.q, archivedOnly: parsed.data.archived === "true" }, page, viewerScope(user));
  return NextResponse.json({ companies: result.items, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
}
