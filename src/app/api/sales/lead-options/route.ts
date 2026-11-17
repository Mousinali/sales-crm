import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listSaleLeadOptions } from "@/lib/sales/leadOptions";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword || user.role !== "ACCOUNTANT") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ leads: await listSaleLeadOptions(pool) });
}
