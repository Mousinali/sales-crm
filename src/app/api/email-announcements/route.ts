import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { createAnnouncement, attachRecipientSummary, listAnnouncements } from "@/lib/email/announce";
import { EmailActionNotAllowedError } from "@/lib/email/errors";

const recipientGroupSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("USER"), userId: z.number().int() }),
  z.object({ type: z.literal("USERS"), userIds: z.array(z.number().int()).min(1) }),
  z.object({ type: z.literal("ALL_PRE_SALES") }),
  z.object({ type: z.literal("ALL_SALESPEOPLE") }),
]);

const createAnnouncementSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1),
  recipientGroup: recipientGroupSchema,
});

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createAnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const announcement = await createAnnouncement(pool, { senderId: user.id, senderRole: user.role, ...parsed.data });
    const [withSummary] = await attachRecipientSummary(pool, [announcement]);
    return NextResponse.json(withSummary, { status: 201 });
  } catch (error) {
    if (error instanceof EmailActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const announcements = await listAnnouncements(pool, user);
  return NextResponse.json({ announcements });
}
