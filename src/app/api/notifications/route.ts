import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listNotifications, listNotificationsPage, NOTIFICATION_TYPES } from "@/lib/notifications/record";
import { parsePageParams } from "@/lib/pagination";

const pageQuerySchema = z.object({
  type: z.enum(NOTIFICATION_TYPES).optional(),
  q: z.string().trim().min(1).optional(),
  read: z.enum(["UNREAD", "READ"]).optional(),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const { searchParams } = url;

  // The bell's one-shot "give me everything" fetch has no `page` param —
  // kept as the unpaginated legacy shape so it doesn't need to change.
  // The full Notifications page always sends `page`, which switches to
  // the paginated, filterable path.
  if (!searchParams.has("page")) {
    const notifications = await listNotifications(pool, user.id, { unreadOnly: searchParams.get("unread") === "true" });
    return NextResponse.json({ notifications });
  }

  const parsed = pageQuerySchema.safeParse({
    type: searchParams.get("type") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    read: searchParams.get("read") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const page = parsePageParams(searchParams);
  const result = await listNotificationsPage(pool, user.id, { type: parsed.data.type, q: parsed.data.q, read: parsed.data.read }, page);
  return NextResponse.json({
    notifications: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
}
