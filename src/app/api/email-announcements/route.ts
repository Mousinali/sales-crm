import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { createAnnouncement } from "@/lib/email/announce";
import { EmailActionNotAllowedError } from "@/lib/email/errors";
import type { EmailAnnouncementRow } from "@/lib/email/types";

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

async function withRecipientSummary(announcements: EmailAnnouncementRow[]) {
  if (announcements.length === 0) return [];
  const ids = announcements.map((a) => a.id);
  const { rows } = await pool.query<{ announcement_id: number; status: string; count: number }>(
    `SELECT er.announcement_id, el.status, count(*)::int AS count
     FROM email_recipients er JOIN email_logs el ON el.recipient_id = er.id
     WHERE er.announcement_id = ANY($1)
     GROUP BY er.announcement_id, el.status`,
    [ids],
  );
  const summaries = new Map<number, Record<string, number>>();
  for (const row of rows) {
    const existing = summaries.get(row.announcement_id) ?? {};
    existing[row.status] = row.count;
    summaries.set(row.announcement_id, existing);
  }
  return announcements.map((a) => ({ ...a, recipientStatusCounts: summaries.get(a.id) ?? {} }));
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
  const parsed = createAnnouncementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const announcement = await createAnnouncement(pool, { senderId: user.id, senderRole: user.role, ...parsed.data });
    const [withSummary] = await withRecipientSummary([announcement]);
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

  const { rows } = await pool.query<EmailAnnouncementRow>(
    user.role === "SUPER_ADMIN"
      ? "SELECT * FROM email_announcements ORDER BY created_at DESC"
      : "SELECT * FROM email_announcements WHERE sender_user_id = $1 ORDER BY created_at DESC",
    user.role === "SUPER_ADMIN" ? [] : [user.id],
  );
  const announcements = await withRecipientSummary(rows);
  return NextResponse.json({ announcements });
}
