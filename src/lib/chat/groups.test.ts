import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { sendMessage, getChatState, setBlocked, setMuted, isMuted, getAttachmentForUser, listMessages, getUnreadMessageCount } from "./crud";
import { createGroup, listGroups, sendGroupMessage, getGroupDetail, addGroupMembers, leaveGroup, markGroupRead } from "./groups";
import { ChatBlockedError, ChatAttachmentError, ChatRecipientNotFoundError } from "./errors";

const adminEmail = `chat2-admin-${Date.now()}@example.com`;
let adminId: number;
let a: number;
let b: number;
let c: number;
let d: number;
const emails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  const mk = async (tag: string) => {
    const u = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: tag, email: `chat2-${tag}-${Date.now()}@example.com` });
    emails.push(u.email);
    return u.id;
  };
  [a, b, c, d] = [await mk("a"), await mk("b"), await mk("c"), await mk("d")];
});

afterAll(async () => {
  const ids = [a, b, c, d];
  await pool.query("DELETE FROM chat_attachments WHERE message_id IN (SELECT id FROM direct_messages WHERE sender_id = ANY($1)) OR group_message_id IN (SELECT id FROM group_messages WHERE sender_id = ANY($1))", [ids]);
  await pool.query("DELETE FROM group_messages WHERE sender_id = ANY($1)", [ids]);
  await pool.query("DELETE FROM chat_group_members WHERE user_id = ANY($1)", [ids]);
  await pool.query("DELETE FROM chat_groups WHERE created_by = ANY($1)", [ids]);
  await pool.query("DELETE FROM chat_blocks WHERE blocker_id = ANY($1)", [ids]);
  await pool.query("DELETE FROM chat_mutes WHERE user_id = ANY($1)", [ids]);
  await pool.query("DELETE FROM direct_messages WHERE sender_id = ANY($1) OR recipient_id = ANY($1)", [ids]);
  await pool.query("DELETE FROM audit_logs WHERE actor_user_id = ANY(SELECT id FROM users WHERE email = ANY($1)) OR actor_user_id = $2", [[...emails, adminEmail], adminId]);
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...emails, adminEmail]]);
});

describe("direct chat: block, mute, files", () => {
  it("blocks in both directions until unblocked", async () => {
    await setBlocked(pool, a, b, true);
    expect(await getChatState(pool, a, b)).toMatchObject({ blockedByMe: true, blockedByThem: false });
    expect(await getChatState(pool, b, a)).toMatchObject({ blockedByMe: false, blockedByThem: true });
    await expect(sendMessage(pool, { senderId: b, recipientId: a, body: "hi" })).rejects.toThrow(ChatBlockedError);
    await expect(sendMessage(pool, { senderId: a, recipientId: b, body: "hi" })).rejects.toThrow(ChatBlockedError);
    await setBlocked(pool, a, b, false);
    await expect(sendMessage(pool, { senderId: b, recipientId: a, body: "hi again" })).resolves.toMatchObject({ body: "hi again" });
  });

  it("tracks muting per user", async () => {
    await setMuted(pool, a, b, true);
    expect(await isMuted(pool, a, b)).toBe(true);
    expect(await isMuted(pool, b, a)).toBe(false);
    await setMuted(pool, a, b, false);
    expect(await isMuted(pool, a, b)).toBe(false);
  });

  it("sends a file, lists it, and only lets the two participants download it", async () => {
    const msg = await sendMessage(pool, { senderId: a, recipientId: b, body: "", attachment: { name: "r.pdf", mimeType: "application/pdf", data: Buffer.from("PDFDATA") } });
    expect(msg).toMatchObject({ attachment_name: "r.pdf", attachment_size: 7 });
    expect((await listMessages(pool, { viewerId: b, withUserId: a })).some((m) => m.attachment_name === "r.pdf")).toBe(true);
    expect((await getAttachmentForUser(pool, b, msg.attachment_id!))?.data.toString()).toBe("PDFDATA");
    expect(await getAttachmentForUser(pool, c, msg.attachment_id!)).toBeNull();
  });

  it("rejects an empty message and an oversize file", async () => {
    await expect(sendMessage(pool, { senderId: a, recipientId: b, body: "  " })).rejects.toThrow();
    await expect(
      sendMessage(pool, { senderId: a, recipientId: b, body: "", attachment: { name: "big", mimeType: "x/y", data: Buffer.alloc(10 * 1024 * 1024 + 1) } }),
    ).rejects.toThrow(ChatAttachmentError);
  });
});

describe("team chats", () => {
  let groupId: number;

  it("creates a group with the creator and picked members", async () => {
    groupId = (await createGroup(pool, { creatorId: a, name: "Sales team", memberIds: [b, c] })).id;
    const detail = await getGroupDetail(pool, a, groupId);
    expect(detail.members.map((m) => m.user_id).sort()).toEqual([a, b, c].sort());
    await expect(createGroup(pool, { creatorId: a, name: "", memberIds: [b] })).rejects.toThrow(ChatRecipientNotFoundError);
    await expect(createGroup(pool, { creatorId: a, name: "Solo", memberIds: [] })).rejects.toThrow(ChatRecipientNotFoundError);
  });

  it("delivers messages and files to every member, with per-member unread counts", async () => {
    await sendGroupMessage(pool, { groupId, senderId: b, body: "hello team" });
    const file = await sendGroupMessage(pool, { groupId, senderId: b, body: "", attachment: { name: "plan.xlsx", mimeType: "x/y", data: Buffer.from("XLS") } });
    expect((await getGroupDetail(pool, c, groupId)).messages.map((m) => m.body)).toContain("hello team");
    expect((await getAttachmentForUser(pool, c, file.attachment_id!))?.file_name).toBe("plan.xlsx");
    expect(await getAttachmentForUser(pool, d, file.attachment_id!)).toBeNull();
    expect((await listGroups(pool, a)).find((g) => g.id === groupId)?.unread_count).toBe(2);
    expect(await getUnreadMessageCount(pool, a)).toBeGreaterThanOrEqual(2);
    await markGroupRead(pool, a, groupId);
    expect((await listGroups(pool, a)).find((g) => g.id === groupId)?.unread_count).toBe(0);
  });

  it("keeps non-members out", async () => {
    await expect(getGroupDetail(pool, d, groupId)).rejects.toThrow(ChatRecipientNotFoundError);
    await expect(sendGroupMessage(pool, { groupId, senderId: d, body: "let me in" })).rejects.toThrow(ChatRecipientNotFoundError);
    expect((await listGroups(pool, d)).some((g) => g.id === groupId)).toBe(false);
  });

  it("lets only the creator add members, and anyone leave", async () => {
    await expect(addGroupMembers(pool, b, groupId, [d])).rejects.toThrow(ChatRecipientNotFoundError);
    expect(await addGroupMembers(pool, a, groupId, [d])).toEqual([d]);
    await leaveGroup(pool, d, groupId);
    await expect(getGroupDetail(pool, d, groupId)).rejects.toThrow(ChatRecipientNotFoundError);
  });
});
