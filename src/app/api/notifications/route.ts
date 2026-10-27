import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listNotifications } from "@/lib/notifications/record";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const notifications = await listNotifications(pool, user.id, { unreadOnly: searchParams.get("unread") === "true" });
  return NextResponse.json({ notifications });
}
