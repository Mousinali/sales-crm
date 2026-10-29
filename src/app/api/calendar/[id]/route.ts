import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { CALENDAR_EVENT_TYPES } from "@/lib/calendar/types";
import { updateCalendarEvent, deleteCalendarEvent } from "@/lib/calendar/crud";
import { CalendarEventNotFoundError, CalendarEventNotAccessibleError } from "@/lib/calendar/errors";

const patchSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).optional(),
    type: z.enum(CALENDAR_EVENT_TYPES).optional(),
    startsAt: z.coerce.date().optional(),
    attendeeUserIds: z.array(z.number().int()).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const event = await updateCalendarEvent(pool, { actorId: user.id, actorName: user.name, eventId, ...parsed.data });
    return NextResponse.json(event);
  } catch (error) {
    if (error instanceof CalendarEventNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "One or more invited users do not exist" }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(
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

  try {
    await deleteCalendarEvent(pool, { actorId: user.id, actorName: user.name, eventId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof CalendarEventNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof CalendarEventNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
