import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { ATTENDEE_STATUSES } from "@/lib/calendar/types";
import { respondToCalendarEvent } from "@/lib/calendar/crud";
import { CalendarEventNotAccessibleError } from "@/lib/calendar/errors";

const respondSchema = z
  .object({
    status: z.enum(ATTENDEE_STATUSES).optional(),
    remarks: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

// An invited attendee's own response (completion status + remarks) to an
// event — separate from PATCH /api/calendar/[id], which is for editing the
// event itself and isn't restricted to attendees.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const attendee = await respondToCalendarEvent(pool, { actorId: user.id, actorName: user.name, eventId, ...parsed.data });
    return NextResponse.json(attendee);
  } catch (error) {
    if (error instanceof CalendarEventNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
