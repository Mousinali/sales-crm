import type { Pool } from "pg";
import { ChatRecipientNotFoundError, ChatMessageNotFoundError } from "./errors";
import type { ConversationSummary, DirectMessageRow } from "./types";

// `SELECT ... FROM users WHERE id = $2 AND status = 'ACTIVE'` re-derives the
// recipient at insert time instead of trusting the caller's id directly, so
// a nonexistent/inactive recipient yields zero rows (caught below) rather
// than an FK violation.
export async function sendMessage(
  pool: Pool,
  input: { senderId: number; recipientId: number; body: string; replyToMessageId?: number },
): Promise<DirectMessageRow> {
  if (input.senderId === input.recipientId) {
    throw new ChatRecipientNotFoundError("Cannot message yourself");
  }
  if (input.replyToMessageId !== undefined) {
    // Scoped to this sender/recipient pair so a reply can't point at a
    // message from an unrelated conversation the sender isn't part of.
    const { rows: targetRows } = await pool.query(
      `SELECT 1 FROM direct_messages
       WHERE id = $1 AND ((sender_id = $2 AND recipient_id = $3) OR (sender_id = $3 AND recipient_id = $2))`,
      [input.replyToMessageId, input.senderId, input.recipientId],
    );
    if (targetRows.length === 0) {
      throw new ChatMessageNotFoundError(`No message ${input.replyToMessageId} in this conversation`);
    }
  }
  const { rows } = await pool.query<DirectMessageRow>(
    `INSERT INTO direct_messages (sender_id, recipient_id, body, reply_to_message_id)
     SELECT $1, id, $3, $4 FROM users WHERE id = $2 AND status = 'ACTIVE'
     RETURNING *`,
    [input.senderId, input.recipientId, input.body, input.replyToMessageId ?? null],
  );
  if (rows.length === 0) {
    throw new ChatRecipientNotFoundError(`No active user ${input.recipientId}`);
  }
  return rows[0];
}

export async function listMessages(
  pool: Pool,
  input: { viewerId: number; withUserId: number; limit?: number },
): Promise<DirectMessageRow[]> {
  const { rows } = await pool.query<DirectMessageRow>(
    `SELECT * FROM direct_messages
     WHERE (sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1)
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.viewerId, input.withUserId, input.limit ?? 50],
  );
  return rows.reverse();
}

export async function listConversations(pool: Pool, viewerId: number): Promise<ConversationSummary[]> {
  const { rows } = await pool.query<ConversationSummary>(
    `SELECT * FROM (
       SELECT DISTINCT ON (t.counterpart_id)
         t.counterpart_id,
         t.body AS last_message,
         t.sender_id AS last_sender_id,
         t.created_at AS last_at,
         (SELECT count(*)::int FROM direct_messages unread
            WHERE unread.sender_id = t.counterpart_id AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS unread_count
       FROM (
         SELECT *, CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS counterpart_id
         FROM direct_messages
         WHERE sender_id = $1 OR recipient_id = $1
       ) t
       ORDER BY t.counterpart_id, t.created_at DESC
     ) conv
     ORDER BY last_at DESC`,
    [viewerId],
  );
  return rows;
}

// Returns the sender of each message just marked read, so the caller can
// push a live "seen" tick update to that sender — not just persist it for
// their next page load.
export async function markRead(pool: Pool, input: { viewerId: number; withUserId: number }): Promise<{ id: number; sender_id: number }[]> {
  const { rows } = await pool.query<{ id: number; sender_id: number }>(
    `UPDATE direct_messages SET read_at = now(), delivered_at = COALESCE(delivered_at, now())
     WHERE recipient_id = $1 AND sender_id = $2 AND read_at IS NULL RETURNING id, sender_id`,
    [input.viewerId, input.withUserId],
  );
  return rows;
}

// Called both right after a send (if the recipient's socket is already
// connected) and when a previously-offline recipient reconnects, so a
// message delivered late still catches up instead of staying a single tick
// forever. Covers the whole inbox, not one conversation, since presence is
// per-user, not per-thread.
export async function markDelivered(pool: Pool, input: { recipientId: number }): Promise<{ id: number; sender_id: number }[]> {
  const { rows } = await pool.query<{ id: number; sender_id: number }>(
    `UPDATE direct_messages SET delivered_at = now() WHERE recipient_id = $1 AND delivered_at IS NULL RETURNING id, sender_id`,
    [input.recipientId],
  );
  return rows;
}
