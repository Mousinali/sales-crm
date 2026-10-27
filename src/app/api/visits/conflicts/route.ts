import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { findConflictingVisit } from "@/lib/visits/schedule";

const conflictsQuerySchema = z.object({
  salespersonId: z.coerce.number().int(),
  visitDate: z.string().trim().min(1),
  startTime: z.string().trim().min(1),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (user.role !== "MARKETING_HEAD") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = conflictsQuerySchema.safeParse({
    salespersonId: url.searchParams.get("salespersonId") ?? undefined,
    visitDate: url.searchParams.get("visitDate") ?? undefined,
    startTime: url.searchParams.get("startTime") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const conflict = await findConflictingVisit(pool, parsed.data);
  return NextResponse.json({ conflict: conflict !== null });
}
