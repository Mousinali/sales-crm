import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { sendEmail } from "./sendEmail";
import { EmailActionNotAllowedError } from "./errors";
import type { EmailAnnouncementRow } from "./types";

type RecipientGroup =
  | { type: "USER"; userId: number }
  | { type: "USERS"; userIds: number[] }
  | { type: "ALL_PRE_SALES" }
  | { type: "ALL_SALESPEOPLE" };

async function resolveRecipientIds(pool: Pool, group: RecipientGroup): Promise<number[]> {
  switch (group.type) {
    case "USER":
      return [group.userId];
    case "USERS":
      return group.userIds;
    case "ALL_PRE_SALES": {
      const { rows } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'PRE_SALES' AND status = 'ACTIVE'");
      return rows.map((r) => r.id);
    }
    case "ALL_SALESPEOPLE": {
      const { rows } = await pool.query<{ id: number }>("SELECT id FROM users WHERE role = 'SALESPERSON' AND status = 'ACTIVE'");
      return rows.map((r) => r.id);
    }
  }
}

export async function createAnnouncement(
  pool: Pool,
  input: { senderId: number; senderRole: Role; subject: string; body: string; recipientGroup: RecipientGroup },
): Promise<EmailAnnouncementRow> {
  if (input.senderRole !== "MARKETING_HEAD" && input.senderRole !== "SUPER_ADMIN") {
    throw new EmailActionNotAllowedError(`${input.senderRole} cannot send announcements`);
  }

  const recipientIds = await resolveRecipientIds(pool, input.recipientGroup);

  const { rows } = await pool.query<EmailAnnouncementRow>(
    `INSERT INTO email_announcements (sender_user_id, subject, body) VALUES ($1, $2, $3) RETURNING *`,
    [input.senderId, input.subject, input.body],
  );
  const announcement = rows[0];

  for (const recipientUserId of recipientIds) {
    // A resolved id can vanish between resolution and this insert (e.g. the
    // user's account was removed out from under an in-flight send) — that
    // one recipient is skipped, not a reason to abort everyone else's send.
    try {
      const { rows: userRows } = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [recipientUserId]);
      if (!userRows[0]) continue;

      const { rows: recipientRows } = await pool.query<{ id: number }>(
        `INSERT INTO email_recipients (announcement_id, recipient_user_id) VALUES ($1, $2) RETURNING id`,
        [announcement.id, recipientUserId],
      );
      const recipientId = recipientRows[0].id;

      const { rows: logRows } = await pool.query<{ id: number }>(
        `INSERT INTO email_logs (recipient_id, status, attempt_count) VALUES ($1, 'PENDING', 0) RETURNING id`,
        [recipientId],
      );
      const logId = logRows[0].id;

      const result = await sendEmail({ to: userRows[0].email, subject: input.subject, body: input.body });

      if (result.ok) {
        await pool.query(
          `UPDATE email_logs SET status = 'SENT', attempt_count = attempt_count + 1, sent_at = now(), updated_at = now() WHERE id = $1`,
          [logId],
        );
      } else {
        await pool.query(
          `UPDATE email_logs SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $1, updated_at = now() WHERE id = $2`,
          [result.error, logId],
        );
      }
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "23503")) throw error;
      // Foreign-key violation: the recipient vanished mid-loop. Skip them.
    }
  }

  return announcement;
}
