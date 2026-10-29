import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { sendMessage, listMessages, listConversations, markRead, markDelivered } from "./crud";
import { ChatRecipientNotFoundError, ChatMessageNotFoundError } from "./errors";

const adminEmail = `chat-admin-${Date.now()}@example.com`;
let aliceId: number;
let bobId: number;
let carolId: number;
const createdEmails: string[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  // HR/Marketing Head, not Pre-sales/Salesperson, for the same reason as
  // calendar's tests: email/announce.test.ts resolves ALL_PRE_SALES/
  // ALL_SALESPERSON against every active user of those roles system-wide.
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "Alice", email: `chat-alice-${Date.now()}@example.com` });
  const mh1 = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "Bob", email: `chat-bob-${Date.now()}@example.com` });
  const mh2 = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "Carol", email: `chat-carol-${Date.now()}@example.com` });

  aliceId = hr.id;
  bobId = mh1.id;
  carolId = mh2.id;
  createdEmails.push(hr.email, mh1.email, mh2.email);
});

afterAll(async () => {
  await pool.query(
    "DELETE FROM direct_messages WHERE sender_id = ANY($1) OR recipient_id = ANY($1)",
    [[aliceId, bobId, carolId]],
  );
  await pool.query(
    "DELETE FROM notifications WHERE recipient_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("direct messages", () => {
  it("sends a message and lists it for both participants, oldest first", async () => {
    await sendMessage(pool, { senderId: aliceId, recipientId: bobId, body: "Hi Bob" });
    await sendMessage(pool, { senderId: bobId, recipientId: aliceId, body: "Hi Alice" });

    const fromAlice = await listMessages(pool, { viewerId: aliceId, withUserId: bobId });
    expect(fromAlice.map((m) => m.body)).toEqual(["Hi Bob", "Hi Alice"]);

    const fromBob = await listMessages(pool, { viewerId: bobId, withUserId: aliceId });
    expect(fromBob.map((m) => m.body)).toEqual(["Hi Bob", "Hi Alice"]);
  });

  it("rejects messaging yourself", async () => {
    await expect(sendMessage(pool, { senderId: aliceId, recipientId: aliceId, body: "Note to self" })).rejects.toThrow(
      ChatRecipientNotFoundError,
    );
  });

  it("rejects messaging a nonexistent user", async () => {
    await expect(sendMessage(pool, { senderId: aliceId, recipientId: 999_999_999, body: "???" })).rejects.toThrow(
      ChatRecipientNotFoundError,
    );
  });

  it("lists conversations with the latest message and unread count, most recent first", async () => {
    await sendMessage(pool, { senderId: carolId, recipientId: aliceId, body: "Carol says hi" });

    const conversations = await listConversations(pool, aliceId);
    expect(conversations[0]).toMatchObject({ counterpart_id: carolId, last_message: "Carol says hi", unread_count: 1 });
    expect(conversations.some((c) => c.counterpart_id === bobId)).toBe(true);
  });

  it("clears the unread count once the recipient marks the conversation read, and marks it delivered too", async () => {
    const updated = await markRead(pool, { viewerId: aliceId, withUserId: carolId });
    expect(updated.length).toBeGreaterThan(0);
    expect(updated.every((m) => m.sender_id === carolId)).toBe(true);

    const conversations = await listConversations(pool, aliceId);
    expect(conversations.find((c) => c.counterpart_id === carolId)).toMatchObject({ unread_count: 0 });

    const [read] = await listMessages(pool, { viewerId: aliceId, withUserId: carolId });
    expect(read.delivered_at).not.toBeNull();
  });

  it("marks every undelivered message for a recipient as delivered in one call", async () => {
    const sent = await sendMessage(pool, { senderId: bobId, recipientId: aliceId, body: "Delivery check" });
    expect(sent.delivered_at).toBeNull();

    const updated = await markDelivered(pool, { recipientId: aliceId });
    expect(updated.some((m) => m.id === sent.id)).toBe(true);

    const rows = await listMessages(pool, { viewerId: aliceId, withUserId: bobId });
    expect(rows.find((m) => m.id === sent.id)?.delivered_at).not.toBeNull();

    // A second call has nothing left to mark.
    const again = await markDelivered(pool, { recipientId: aliceId });
    expect(again.some((m) => m.id === sent.id)).toBe(false);
  });

  it("carries reply_to_message_id through when replying to a message in the same conversation", async () => {
    const original = await sendMessage(pool, { senderId: aliceId, recipientId: bobId, body: "Original" });
    const reply = await sendMessage(pool, { senderId: bobId, recipientId: aliceId, body: "Replying", replyToMessageId: original.id });
    expect(reply.reply_to_message_id).toBe(original.id);
  });

  it("rejects replying to a message from a different conversation", async () => {
    const carolMessage = await sendMessage(pool, { senderId: carolId, recipientId: aliceId, body: "To Alice only" });
    await expect(
      sendMessage(pool, { senderId: aliceId, recipientId: bobId, body: "Sneaky reply", replyToMessageId: carolMessage.id }),
    ).rejects.toThrow(ChatMessageNotFoundError);
  });
});
