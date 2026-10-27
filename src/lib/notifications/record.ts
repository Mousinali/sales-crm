import type { Pool } from "pg";

export type NotificationType =
  | "LEAD_ASSIGNED"
  | "LEAD_TRANSFERRED"
  | "VISIT_SCHEDULED"
  | "VISIT_RESCHEDULED"
  | "VISIT_CANCELLED";

export type NotificationRow = {
  id: number;
  recipient_user_id: number;
  type: NotificationType;
  lead_id: number | null;
  message: string;
  read_at: Date | null;
  created_at: Date;
};

export async function recordNotification(
  pool: Pool,
  input: { recipientUserId: number; type: NotificationType; leadId?: number; message: string },
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (recipient_user_id, type, lead_id, message) VALUES ($1, $2, $3, $4)`,
    [input.recipientUserId, input.type, input.leadId ?? null, input.message],
  );
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
