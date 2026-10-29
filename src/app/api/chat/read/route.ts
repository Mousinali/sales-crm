import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { markRead } from "@/lib/chat/crud";
import { getIO } from "@/lib/socket";

const readSchema = z.object({ withUserId: z.number().int() });

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = readSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const updated = await markRead(pool, { viewerId: user.id, withUserId: parsed.data.withUserId });
  if (updated.length > 0) {
    getIO()?.to(`user:${parsed.data.withUserId}`).emit("messages:read", { ids: updated.map((m) => m.id) });
  }
  return NextResponse.json({ ok: true });
}
