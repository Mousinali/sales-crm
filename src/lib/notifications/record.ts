import type { Pool } from "pg";
import { getIO } from "@/lib/socket";

export type NotificationType =
  | "LEAD_ASSIGNED"
  | "LEAD_TRANSFERRED"
  | "VISIT_SCHEDULED"
  | "VISIT_RESCHEDULED"
  | "VISIT_CANCELLED"
  | "CALENDAR_EVENT"
  | "CHAT_MESSAGE";

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
