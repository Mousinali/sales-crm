import type { Pool } from "pg";
import { ChatRecipientNotFoundError, ChatMessageNotFoundError, ChatBlockedError, ChatAttachmentError } from "./errors";
import { MAX_ATTACHMENT_BYTES, type ChatAttachmentInput, type ChatState, type ConversationSummary, type DirectMessageRow } from "./types";

const MESSAGE_SELECT = `SELECT m.*, a.id AS attachment_id, a.file_name AS attachment_name, a.size_bytes AS attachment_size
  FROM direct_messages m LEFT JOIN chat_attachments a ON a.message_id = m.id`;

export async function getChatState(pool: Pool, viewerId: number, otherId: number): Promise<ChatState> {
  const { rows } = await pool.query<{ blocked_by_me: boolean; blocked_by_them: boolean; muted: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2) AS blocked_by_me,
            EXISTS (SELECT 1 FROM chat_blocks WHERE blocker_id = $2 AND blocked_id = $1) AS blocked_by_them,
            EXISTS (SELECT 1 FROM chat_mutes WHERE user_id = $1 AND muted_user_id = $2) AS muted`,
    [viewerId, otherId],
  );
  return { blockedByMe: rows[0].blocked_by_me, blockedByThem: rows[0].blocked_by_them, muted: rows[0].muted };
}

export async function setBlocked(pool: Pool, userId: number, otherId: number, blocked: boolean): Promise<void> {
  if (userId === otherId) throw new ChatRecipientNotFoundError("Cannot block yourself");
  if (blocked) {
    await pool.query(
      `INSERT INTO chat_blocks (blocker_id, blocked_id) SELECT $1, id FROM users WHERE id = $2 ON CONFLICT DO NOTHING`,
      [userId, otherId],
    );
  } else {
    await pool.query("DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2", [userId, otherId]);
  }
}

export async function setMuted(pool: Pool, userId: number, otherId: number, muted: boolean): Promise<void> {
  if (userId === otherId) throw new ChatRecipientNotFoundError("Cannot mute yourself");
  if (muted) {
    await pool.query(
      `INSERT INTO chat_mutes (user_id, muted_user_id) SELECT $1, id FROM users WHERE id = $2 ON CONFLICT DO NOTHING`,
      [userId, otherId],
    );
  } else {
    await pool.query("DELETE FROM chat_mutes WHERE user_id = $1 AND muted_user_id = $2", [userId, otherId]);
  }
}

// Whether `recipientId` has muted `senderId` — callers skip the bell
// notification (the message itself still arrives and counts as unread).
export async function isMuted(pool: Pool, recipientId: number, senderId: number): Promise<boolean> {
  const { rows } = await pool.query("SELECT 1 FROM chat_mutes WHERE user_id = $1 AND muted_user_id = $2", [recipientId, senderId]);
  return rows.length > 0;
}

// `SELECT ... FROM users WHERE id = $2 AND status = 'ACTIVE'` re-derives the
// recipient at insert time instead of trusting the caller's id directly, so
// a nonexistent/inactive recipient yields zero rows (caught below) rather
// than an FK violation.
export async function sendMessage(
  pool: Pool,
  input: { senderId: number; recipientId: number; body: string; replyToMessageId?: number; attachment?: ChatAttachmentInput },
): Promise<DirectMessageRow> {
  if (input.senderId === input.recipientId) {
    throw new ChatRecipientNotFoundError("Cannot message yourself");
  }
  if (!input.body.trim() && !input.attachment) {
    throw new ChatRecipientNotFoundError("Empty message");
  }
  if (input.attachment) {
    if (input.attachment.data.length === 0) throw new ChatAttachmentError("The file is empty");
    if (input.attachment.data.length > MAX_ATTACHMENT_BYTES) {
      throw new ChatAttachmentError(`Files can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
    }
  }
  const state = await getChatState(pool, input.senderId, input.recipientId);
  if (state.blockedByMe) throw new ChatBlockedError("You blocked this user. Unblock them to send a message.");
  if (state.blockedByThem) throw new ChatBlockedError("You can't message this user.");
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
  // One transaction so a file never ends up without its message (or the reverse).
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO direct_messages (sender_id, recipient_id, body, reply_to_message_id)
       SELECT $1, id, $3, $4 FROM users WHERE id = $2 AND status = 'ACTIVE'
       RETURNING id`,
      [input.senderId, input.recipientId, input.body, input.replyToMessageId ?? null],
    );
    if (rows.length === 0) {
      throw new ChatRecipientNotFoundError(`No active user ${input.recipientId}`);
    }
    if (input.attachment) {
      await client.query(
        `INSERT INTO chat_attachments (message_id, file_name, mime_type, size_bytes, data) VALUES ($1, $2, $3, $4, $5)`,
        [rows[0].id, input.attachment.name, input.attachment.mimeType, input.attachment.data.length, input.attachment.data],
      );
    }
    await client.query("COMMIT");
    const { rows: full } = await pool.query<DirectMessageRow>(`${MESSAGE_SELECT} WHERE m.id = $1`, [rows[0].id]);
    return full[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Only the two people in a direct conversation, or the members of a team
// chat, may download its files.
export async function getAttachmentForUser(
  pool: Pool,
  viewerId: number,
  attachmentId: number,
): Promise<{ file_name: string; mime_type: string; data: Buffer } | null> {
  const { rows } = await pool.query<{ file_name: string; mime_type: string; data: Buffer }>(
    `SELECT a.file_name, a.mime_type, a.data FROM chat_attachments a
     LEFT JOIN direct_messages m ON m.id = a.message_id
     LEFT JOIN group_messages gm ON gm.id = a.group_message_id
     WHERE a.id = $1 AND (
       m.sender_id = $2 OR m.recipient_id = $2
       OR EXISTS (SELECT 1 FROM chat_group_members mem WHERE mem.group_id = gm.group_id AND mem.user_id = $2)
     )`,
    [attachmentId, viewerId],
  );
  return rows[0] ?? null;
}

export async function listMessages(
  pool: Pool,
  input: { viewerId: number; withUserId: number; limit?: number },
): Promise<DirectMessageRow[]> {
  const { rows } = await pool.query<DirectMessageRow>(
    `${MESSAGE_SELECT}
     WHERE (m.sender_id = $1 AND m.recipient_id = $2) OR (m.sender_id = $2 AND m.recipient_id = $1)
     ORDER BY m.created_at DESC
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
         CASE WHEN t.body = '' THEN 'Sent a file' ELSE t.body END AS last_message,
         t.sender_id AS last_sender_id,
         t.created_at AS last_at,
         (SELECT count(*)::int FROM direct_messages unread
            WHERE unread.sender_id = t.counterpart_id AND unread.recipient_id = $1 AND unread.read_at IS NULL) AS unread_count,
         EXISTS (SELECT 1 FROM chat_mutes WHERE user_id = $1 AND muted_user_id = t.counterpart_id) AS muted,
         EXISTS (SELECT 1 FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = t.counterpart_id) AS blocked
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

// Total across every conversation — the sidebar's Chat badge, not a
// per-thread count, so it just counts rows rather than going through
// listConversations' per-counterpart grouping.
export async function getUnreadMessageCount(pool: Pool, viewerId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT (SELECT count(*) FROM direct_messages WHERE recipient_id = $1 AND read_at IS NULL)
          + (SELECT count(*) FROM group_messages gm JOIN chat_group_members mem ON mem.group_id = gm.group_id AND mem.user_id = $1
               WHERE gm.sender_id <> $1 AND gm.created_at > mem.last_read_at) AS count`,
    [viewerId],
  );
  return Number(rows[0].count);
}
