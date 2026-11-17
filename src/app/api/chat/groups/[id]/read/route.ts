import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { markGroupRead } from "@/lib/chat/groups";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await markGroupRead(pool, user.id, groupId);
  return NextResponse.json({ ok: true });
}
