import type { Pool } from "pg";
import { getIO } from "@/lib/socket";
import { toPagedResult, type PageParams, type PagedResult } from "@/lib/pagination";

export const NOTIFICATION_TYPES = [
  "LEAD_ASSIGNED",
  "LEAD_TRANSFERRED",
  "VISIT_SCHEDULED",
  "VISIT_RESCHEDULED",
  "VISIT_CANCELLED",
  "CALENDAR_EVENT",
  "CHAT_MESSAGE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationRow = {
  id: number;
  recipient_user_id: number;
  type: NotificationType;
  lead_id: number | null;
  related_user_id: number | null;
  message: string;
  read_at: Date | null;
  created_at: Date;
};

export async function recordNotification(
  pool: Pool,
  input: { recipientUserId: number; type: NotificationType; leadId?: number; relatedUserId?: number; message: string },
): Promise<void> {
  const { rows } = await pool.query<NotificationRow>(
    `INSERT INTO notifications (recipient_user_id, type, lead_id, related_user_id, message) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.recipientUserId, input.type, input.leadId ?? null, input.relatedUserId ?? null, input.message],
  );
  // Best-effort live push so an already-open tab's bell updates instantly
  // instead of only on next page load — `getIO()` is null in tests and in
  // anything not running under the custom server, so this is a no-op there.
  getIO()?.to(`user:${rows[0].recipient_user_id}`).emit("notification:new", rows[0]);
}

export async function listNotifications(
  pool: Pool,
  viewerId: number,
  filters?: { unreadOnly?: boolean },
): Promise<NotificationRow[]> {
  const { rows } = await pool.query<NotificationRow>(
    `SELECT * FROM notifications WHERE recipient_user_id = $1 ${filters?.unreadOnly ? "AND read_at IS NULL" : ""} ORDER BY created_at DESC`,
    [viewerId],
  );
  return rows;
}

export async function listNotificationsPage(
  pool: Pool,
  viewerId: number,
  filters: { type?: NotificationType; q?: string; read?: "UNREAD" | "READ" },
  page: PageParams,
): Promise<PagedResult<NotificationRow>> {
  const conditions = ["recipient_user_id = $1"];
  const params: unknown[] = [viewerId];

  if (filters.type) {
    params.push(filters.type);
    conditions.push(`type = $${params.length}`);
  }
  if (filters.read === "UNREAD") {
    conditions.push("read_at IS NULL");
  } else if (filters.read === "READ") {
    conditions.push("read_at IS NOT NULL");
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    conditions.push(`message ILIKE $${params.length}`);
  }

  const { rows } = await pool.query<NotificationRow & { total_count: number }>(
    `SELECT *, count(*) OVER() AS total_count FROM notifications WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, page.pageSize, (page.page - 1) * page.pageSize],
  );
  return toPagedResult(rows, page);
}

export async function markNotificationRead(
  pool: Pool,
  input: { viewerId: number; notificationId: number },
): Promise<void> {
  const result = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND recipient_user_id = $2`,
    [input.notificationId, input.viewerId],
  );
  if (result.rowCount === 0) {
    throw new Error(`Notification ${input.notificationId} is not visible to user ${input.viewerId}`);
  }
}

export async function deleteNotification(
  pool: Pool,
  input: { viewerId: number; notificationId: number },
): Promise<void> {
  const result = await pool.query(
    `DELETE FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
    [input.notificationId, input.viewerId],
  );
  if (result.rowCount === 0) {
    throw new Error(`Notification ${input.notificationId} is not visible to user ${input.viewerId}`);
  }
}
