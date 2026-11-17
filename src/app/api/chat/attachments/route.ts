import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { sendMessage, isMuted } from "@/lib/chat/crud";
import { recordNotification } from "@/lib/notifications/record";
import { getIO } from "@/lib/socket";
import { ChatRecipientNotFoundError, ChatBlockedError, ChatAttachmentError } from "@/lib/chat/errors";

// multipart/form-data: file, recipientId, optional body (a caption). Goes
// through REST rather than the socket (binary + size limits), then pushes
// the same live "message:new" a text send does.
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const recipientId = Number(form?.get("recipientId"));
  if (!(file instanceof File) || !Number.isInteger(recipientId)) {
    return NextResponse.json({ error: "Choose a file to send" }, { status: 400 });
  }

  try {
    const message = await sendMessage(pool, {
      senderId: user.id,
      recipientId,
      body: String(form?.get("body") ?? "").trim(),
      attachment: { name: file.name || "file", mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) },
    });
    if (!(await isMuted(pool, recipientId, user.id))) {
      await recordNotification(pool, { recipientUserId: recipientId, type: "CHAT_MESSAGE", relatedUserId: user.id, message: `${user.name} sent you a file` });
    }
    getIO()?.to(`user:${user.id}`).to(`user:${recipientId}`).emit("message:new", message);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof ChatBlockedError || error instanceof ChatAttachmentError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    throw error;
  }
}
