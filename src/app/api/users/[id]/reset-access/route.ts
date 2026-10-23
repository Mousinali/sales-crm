import { NextResponse } from "next/server";
import { pool } from "../../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../../lib/auth/rbac";
import { resetUserAccess } from "../../../../../lib/users/resetAccess";
import { RoleNotManageableError, UserNotFoundError } from "../../../../../lib/users/errors";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const result = await resetUserAccess(pool, { actorId: user.id, actorRole: user.role, targetId });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof UserNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
