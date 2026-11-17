import type { Pool } from "pg";
import { ChatRecipientNotFoundError, ChatAttachmentError } from "./errors";
import { MAX_ATTACHMENT_BYTES, type ChatAttachmentInput } from "./types";

export type GroupSummary = {
  id: number;
  name: string;
  created_by: number;
  last_message: string | null;
  last_sender_id: number | null;
  last_at: Date;
  unread_count: number;
  muted: boolean;
};

export type GroupMember = { user_id: number; name: string; role: string; avatar_url: string | null };

export type GroupMessageRow = {
  id: number;
  group_id: number;
  sender_id: number;
  sender_name: string;
  body: string;
  created_at: Date;
  attachment_id: number | null;
  attachment_name: string | null;
  attachment_size: number | null;
};

const MESSAGE_SELECT = `SELECT m.*, u.name AS sender_name, a.id AS attachment_id, a.file_name AS attachment_name, a.size_bytes AS attachment_size
  FROM group_messages m JOIN users u ON u.id = m.sender_id LEFT JOIN chat_attachments a ON a.group_message_id = m.id`;

async function assertMember(pool: Pool, groupId: number, userId: number): Promise<void> {
  const { rows } = await pool.query("SELECT 1 FROM chat_group_members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
  if (rows.length === 0) throw new ChatRecipientNotFoundError(`Not a member of group ${groupId}`);
}

export async function createGroup(pool: Pool, input: { creatorId: number; name: string; memberIds: number[] }): Promise<{ id: number }> {
  const name = input.name.trim();
  if (!name) throw new ChatRecipientNotFoundError("A team chat needs a name");
  // Only active users can be added; the creator is always a member.
  const { rows: valid } = await pool.query<{ id: number }>("SELECT id FROM users WHERE id = ANY($1) AND status = 'ACTIVE'", [
    [...new Set([...input.memberIds, input.creatorId])],
  ]);
  const memberIds = valid.map((r) => r.id);
  if (!memberIds.includes(input.creatorId) || memberIds.length < 2) {
    throw new ChatRecipientNotFoundError("Pick at least one other active member");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>("INSERT INTO chat_groups (name, created_by) VALUES ($1, $2) RETURNING id", [name, input.creatorId]);
    await client.query("INSERT INTO chat_group_members (group_id, user_id) SELECT $1, unnest($2::bigint[])", [rows[0].id, memberIds]);
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function listGroups(pool: Pool, viewerId: number): Promise<GroupSummary[]> {
  const { rows } = await pool.query<GroupSummary>(
    `SELECT g.id, g.name, g.created_by, mem.muted,
            COALESCE(last.created_at, g.created_at) AS last_at,
            CASE WHEN last.body = '' THEN 'Sent a file' ELSE last.body END AS last_message,
            last.sender_id AS last_sender_id,
            (SELECT count(*)::int FROM group_messages gm
               WHERE gm.group_id = g.id AND gm.sender_id <> $1 AND gm.created_at > mem.last_read_at) AS unread_count
     FROM chat_groups g
     JOIN chat_group_members mem ON mem.group_id = g.id AND mem.user_id = $1
     LEFT JOIN LATERAL (SELECT body, sender_id, created_at FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) last ON true
     ORDER BY last_at DESC`,
    [viewerId],
  );
  return rows;
}

export async function getGroupDetail(pool: Pool, viewerId: number, groupId: number) {
  await assertMember(pool, groupId, viewerId);
  const [group, members, messages] = await Promise.all([
    pool.query<{ id: number; name: string; created_by: number }>("SELECT id, name, created_by FROM chat_groups WHERE id = $1", [groupId]),
    pool.query<GroupMember>(
      `SELECT u.id AS user_id, u.name, u.role, u.avatar_url FROM chat_group_members m JOIN users u ON u.id = m.user_id
       WHERE m.group_id = $1 ORDER BY u.name`,
      [groupId],
    ),
    pool.query<GroupMessageRow>(`SELECT * FROM (${MESSAGE_SELECT} WHERE m.group_id = $1 ORDER BY m.created_at DESC LIMIT 100) t ORDER BY created_at`, [groupId]),
  ]);
  const { rows: mine } = await pool.query<{ muted: boolean }>("SELECT muted FROM chat_group_members WHERE group_id = $1 AND user_id = $2", [groupId, viewerId]);
  return { group: group.rows[0], members: members.rows, messages: messages.rows, muted: mine[0].muted };
}

export async function sendGroupMessage(
  pool: Pool,
  input: { groupId: number; senderId: number; body: string; attachment?: ChatAttachmentInput },
): Promise<GroupMessageRow> {
  await assertMember(pool, input.groupId, input.senderId);
  if (!input.body.trim() && !input.attachment) throw new ChatRecipientNotFoundError("Empty message");
  if (input.attachment) {
    if (input.attachment.data.length === 0) throw new ChatAttachmentError("The file is empty");
    if (input.attachment.data.length > MAX_ATTACHMENT_BYTES) throw new ChatAttachmentError(`Files can be at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>("INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3) RETURNING id", [
      input.groupId,
      input.senderId,
      input.body,
    ]);
    if (input.attachment) {
      await client.query(
        "INSERT INTO chat_attachments (group_message_id, file_name, mime_type, size_bytes, data) VALUES ($1, $2, $3, $4, $5)",
        [rows[0].id, input.attachment.name, input.attachment.mimeType, input.attachment.data.length, input.attachment.data],
      );
    }
    // Sending counts as having read everything up to now.
    await client.query("UPDATE chat_group_members SET last_read_at = now() WHERE group_id = $1 AND user_id = $2", [input.groupId, input.senderId]);
    await client.query("COMMIT");
    const { rows: full } = await pool.query<GroupMessageRow>(`${MESSAGE_SELECT} WHERE m.id = $1`, [rows[0].id]);
    return full[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function markGroupRead(pool: Pool, viewerId: number, groupId: number): Promise<void> {
  await pool.query("UPDATE chat_group_members SET last_read_at = now() WHERE group_id = $1 AND user_id = $2", [groupId, viewerId]);
}

export async function setGroupMuted(pool: Pool, viewerId: number, groupId: number, muted: boolean): Promise<void> {
  await assertMember(pool, groupId, viewerId);
  await pool.query("UPDATE chat_group_members SET muted = $3 WHERE group_id = $1 AND user_id = $2", [groupId, viewerId, muted]);
}

// Only the creator adds people.
export async function addGroupMembers(pool: Pool, actorId: number, groupId: number, userIds: number[]): Promise<number[]> {
  const { rows } = await pool.query<{ created_by: number }>("SELECT created_by FROM chat_groups WHERE id = $1", [groupId]);
  if (!rows[0] || rows[0].created_by !== actorId) throw new ChatRecipientNotFoundError("Only the team chat's creator can add members");
  const { rows: added } = await pool.query<{ user_id: number }>(
    `INSERT INTO chat_group_members (group_id, user_id) SELECT $1, id FROM users WHERE id = ANY($2) AND status = 'ACTIVE'
     ON CONFLICT DO NOTHING RETURNING user_id`,
    [groupId, userIds],
  );
  return added.map((r) => r.user_id);
}

export async function leaveGroup(pool: Pool, viewerId: number, groupId: number): Promise<void> {
  await assertMember(pool, groupId, viewerId);
  await pool.query("DELETE FROM chat_group_members WHERE group_id = $1 AND user_id = $2", [groupId, viewerId]);
}

export async function listMyGroupIds(pool: Pool, userId: number): Promise<number[]> {
  const { rows } = await pool.query<{ group_id: number }>("SELECT group_id FROM chat_group_members WHERE user_id = $1", [userId]);
  return rows.map((r) => r.group_id);
}

export async function getGroupUnreadCount(pool: Pool, viewerId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM group_messages gm JOIN chat_group_members mem ON mem.group_id = gm.group_id AND mem.user_id = $1
     WHERE gm.sender_id <> $1 AND gm.created_at > mem.last_read_at`,
    [viewerId],
  );
  return Number(rows[0].count);
}
