import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { markNotificationRead } from "@/lib/notifications/record";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const notificationId = Number(id);
  if (!Number.isInteger(notificationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    await markNotificationRead(pool, { viewerId: user.id, notificationId });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
