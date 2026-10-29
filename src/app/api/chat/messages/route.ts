import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listMessages, sendMessage } from "@/lib/chat/crud";
import { recordNotification } from "@/lib/notifications/record";
import { ChatRecipientNotFoundError, ChatMessageNotFoundError } from "@/lib/chat/errors";

const sendSchema = z.object({
  recipientId: z.number().int(),
  body: z.string().trim().min(1),
  replyToMessageId: z.number().int().optional(),
});

// History load (used on opening a conversation) and a REST fallback for
// sending — the normal send path is the socket ("message:send" in
// server.ts), which calls the same `sendMessage` so both transports share
// one implementation.
export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const withUserId = Number(new URL(request.url).searchParams.get("with"));
  if (!Number.isInteger(withUserId)) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const messages = await listMessages(pool, { viewerId: user.id, withUserId });
  return NextResponse.json({ messages });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const message = await sendMessage(pool, {
      senderId: user.id,
      recipientId: parsed.data.recipientId,
      body: parsed.data.body,
      replyToMessageId: parsed.data.replyToMessageId,
    });
    await recordNotification(pool, {
      recipientUserId: message.recipient_id,
      type: "CHAT_MESSAGE",
      relatedUserId: user.id,
      message: `${user.name} sent you a message`,
    });
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof ChatRecipientNotFoundError) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }
    if (error instanceof ChatMessageNotFoundError) {
      return NextResponse.json({ error: "Message to reply to was not found" }, { status: 404 });
    }
    throw error;
  }
}
