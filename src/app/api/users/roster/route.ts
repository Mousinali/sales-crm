import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";

// A minimal roster (id/name/role only, no email) available to any
// authenticated user — used by Calendar (picking attendees) and Chat
// (picking who to message). `/api/users` is intentionally admin-only (it
// exposes email and feeds user management), which would otherwise block
// Pre-sales/Salesperson from using either feature at all.
//
// This is a picker, not a table: instead of paging through hundreds of
// users, it always caps the result and expects the caller to narrow with
// `q` (a name search) once the org is bigger than one screenful.
const ROSTER_LIMIT = 50;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get("q")?.trim();
  const conditions = ["status = 'ACTIVE'"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    conditions.push(`name ILIKE $${params.length}`);
  }
  params.push(ROSTER_LIMIT);

  const { rows } = await pool.query<{ id: number; name: string; role: string }>(
    `SELECT id, name, role FROM users WHERE ${conditions.join(" AND ")} ORDER BY name LIMIT $${params.length}`,
    params,
  );
  return NextResponse.json({ users: rows });
}
