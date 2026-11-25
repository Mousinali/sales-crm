import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { ROLES } from "@/lib/auth/roles";

// A minimal roster (id/name/role only, no email) available to any
// authenticated user — used by Calendar (picking attendees) and Chat
// (picking who to message). `/api/users` is intentionally admin-only (it
// exposes email and feeds user management), which would otherwise block
// Pre-sales/Salesperson from using either feature at all.
//
// This is a picker, not a table: instead of paging through hundreds of
// users, it always caps the result and expects the caller to narrow with
// `q` (a name or role search) once the org is bigger than one screenful.
//
// Optional, for pickers that scroll through a long list: `limit` (max 50),
// `offset`, `roles` (comma-separated) and `exclude` (comma-separated user
// ids). The response always says whether `hasMore` rows follow.
const ROSTER_LIMIT = 50;

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const search = new URL(request.url).searchParams;
  const q = search.get("q")?.trim();
  const conditions = ["status = 'ACTIVE'"];
  const params: unknown[] = [];
  if (q) {
    params.push(`%${q}%`);
    // Role keys read "PRE_SALES"; people type "pre sales" or "pre-sales".
    conditions.push(`(name ILIKE $${params.length} OR replace(lower(role), '_', ' ') ILIKE replace($${params.length}, '-', ' '))`);
  }
  const roles = (search.get("roles") ?? "").split(",").filter((r) => (ROLES as readonly string[]).includes(r));
  if (roles.length > 0) {
    params.push(roles);
    conditions.push(`role = ANY($${params.length})`);
  }
  const exclude = (search.get("exclude") ?? "").split(",").map(Number).filter(Number.isSafeInteger);
  if (exclude.length > 0) {
    params.push(exclude);
    conditions.push(`id <> ALL($${params.length}::bigint[])`);
  }
  const limit = Math.min(Math.max(Math.trunc(Number(search.get("limit"))) || ROSTER_LIMIT, 1), ROSTER_LIMIT);
  const offset = Math.min(Math.max(Math.trunc(Number(search.get("offset"))) || 0, 0), 1_000_000);
  params.push(limit + 1, offset);

  const { rows } = await pool.query<{ id: number; name: string; role: string; avatar_url: string | null }>(
    `SELECT id, name, role, avatar_url FROM users WHERE ${conditions.join(" AND ")} ORDER BY name, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return NextResponse.json({ users: rows.slice(0, limit), hasMore: rows.length > limit });
}
