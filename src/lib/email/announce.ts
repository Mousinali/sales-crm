import type { Pool } from "pg";
import type { Role } from "@/lib/auth/roles";
import { sendEmail } from "./sendEmail";
import { EmailActionNotAllowedError, EmailAnnouncementNotFoundError } from "./errors";
import type { EmailAnnouncementRow } from "./types";

type RecipientGroup =
  | { type: "USER"; userId: number }
  | { type: "USERS"; userIds: number[] }
  | { type: "ALL_PRE_SALES" }
  | { type: "ALL_SALESPEOPLE" };

async function filterToActivePreSalesOrSalespeople(pool: Pool, userIds: number[]): Promise<number[]> {
  if (userIds.length === 0) return [];
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE id = ANY($1) AND status = 'ACTIVE' AND role IN ('PRE_SALES', 'SALESPERSON')",
    [userIds],
  );
  const allowed = new Set(rows.map((r) => r.id));
  // Keep the caller's original order/dedup rather than the query's — a
  // specific recipient-group is a short, intentional list, not a bulk set.
  return userIds.filter((id, index) => allowed.has(id) && userIds.indexOf(id) === index);
}

async function resolveRecipientIds(pool: Pool, group: RecipientGroup): Promise<number[]> {
  switch (group.type) {
    // A Marketing Head/Super Admin names specific recipients here, but
    // req.md §9 scopes every recipient option to Pre-sales/Salesperson
    // accounts only — an id outside that (e.g. another Marketing Head's)
    // or an inactive one is silently dropped, not emailed.
    case "USER":
      return filterToActivePreSalesOrSalespeople(pool, [group.userId]);
    case "USERS":
      return filterToActivePreSalesOrSalespeople(pool, group.userIds);
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

export async function retryFailedRecipients(
  pool: Pool,
  input: { actorId: number; actorRole: Role; announcementId: number; maxAttempts?: number },
): Promise<{ retried: number; stillFailed: number }> {
  if (input.actorRole !== "MARKETING_HEAD" && input.actorRole !== "SUPER_ADMIN") {
    throw new EmailActionNotAllowedError(`${input.actorRole} cannot retry announcement deliveries`);
  }

  const { rows: announcementRows } = await pool.query<{ id: number; sender_user_id: number; subject: string; body: string }>(
    "SELECT id, sender_user_id, subject, body FROM email_announcements WHERE id = $1",
    [input.announcementId],
  );
  const announcement = announcementRows[0];
  if (!announcement) {
    throw new EmailAnnouncementNotFoundError(`No announcement with id ${input.announcementId}`);
  }
  // A Marketing Head may only retry their own sends — the same scope
  // GET /api/email-announcements already enforces for reading history;
  // only a Super Admin can act across every sender.
  if (input.actorRole !== "SUPER_ADMIN" && announcement.sender_user_id !== input.actorId) {
    throw new EmailActionNotAllowedError(`${input.actorRole} ${input.actorId} cannot retry an announcement they didn't send`);
  }

  const maxAttempts = input.maxAttempts ?? 3;

  const { rows: toRetry } = await pool.query<{ log_id: number; recipient_user_id: number }>(
    `SELECT el.id AS log_id, er.recipient_user_id
     FROM email_logs el JOIN email_recipients er ON er.id = el.recipient_id
     WHERE er.announcement_id = $1 AND el.status = 'FAILED' AND el.attempt_count < $2`,
    [input.announcementId, maxAttempts],
  );

  let retried = 0;
  let stillFailed = 0;

  for (const row of toRetry) {
    // Atomic claim: only proceeds if this row is still FAILED and under
    // maxAttempts right now, so two concurrent retries on the same
    // announcement can't both pick up and resend the same recipient.
    const claim = await pool.query(
      `UPDATE email_logs SET status = 'RETRYING', updated_at = now() WHERE id = $1 AND status = 'FAILED' AND attempt_count < $2 RETURNING id`,
      [row.log_id, maxAttempts],
    );
    if (claim.rowCount === 0) continue;

    const eligible = await filterToActivePreSalesOrSalespeople(pool, [row.recipient_user_id]);
    if (eligible.length === 0) {
      await pool.query(
        `UPDATE email_logs SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = 'recipient is no longer an active Pre-sales/Salesperson', updated_at = now() WHERE id = $1`,
        [row.log_id],
      );
      stillFailed++;
      continue;
    }

    const { rows: userRows } = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [row.recipient_user_id]);
    const result = await sendEmail({ to: userRows[0].email, subject: announcement.subject, body: announcement.body });

    if (result.ok) {
      await pool.query(
        `UPDATE email_logs SET status = 'SENT', attempt_count = attempt_count + 1, sent_at = now(), updated_at = now() WHERE id = $1`,
        [row.log_id],
      );
      retried++;
    } else {
      await pool.query(
        `UPDATE email_logs SET status = 'FAILED', attempt_count = attempt_count + 1, last_error = $1, updated_at = now() WHERE id = $2`,
        [result.error, row.log_id],
      );
      stillFailed++;
    }
  }

  return { retried, stillFailed };
}
