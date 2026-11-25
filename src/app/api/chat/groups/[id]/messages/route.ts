import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { sendGroupMessage } from "@/lib/chat/groups";
import { getIO } from "@/lib/socket";
import { ChatRecipientNotFoundError, ChatAttachmentError } from "@/lib/chat/errors";

// JSON { body } for text, or multipart/form-data { file, body? } for a file.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const groupId = Number((await params).id);
  if (!Number.isSafeInteger(groupId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body = "";
  let attachment: { name: string; mimeType: string; data: Buffer } | undefined;
  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to send" }, { status: 400 });
    body = String(form?.get("body") ?? "").trim();
    attachment = { name: file.name || "file", mimeType: file.type || "application/octet-stream", data: Buffer.from(await file.arrayBuffer()) };
  } else {
    const json = await request.json().catch(() => null);
    body = typeof json?.body === "string" ? json.body.trim() : "";
    if (!body) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const message = await sendGroupMessage(pool, { groupId, senderId: user.id, body, attachment });
    getIO()?.to(`group:${groupId}`).emit("group:message:new", message);
    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof ChatAttachmentError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ChatRecipientNotFoundError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
