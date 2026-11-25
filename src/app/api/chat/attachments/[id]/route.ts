import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { getAttachmentForUser } from "@/lib/chat/crud";

// Always served as a download with a neutral type, so an uploaded HTML/SVG
// file can never run in the app's origin.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const attachmentId = Number((await params).id);
  if (!Number.isSafeInteger(attachmentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const file = await getAttachmentForUser(pool, user.id, attachmentId);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
