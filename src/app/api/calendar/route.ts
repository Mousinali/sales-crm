import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { CALENDAR_EVENT_TYPES } from "@/lib/calendar/types";
import { createCalendarEvent, listCalendarEvents } from "@/lib/calendar/crud";

const createSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  startsAt: z.coerce.date(),
  attendeeUserIds: z.array(z.number().int()).optional(),
});

const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const event = await createCalendarEvent(pool, { creatorId: user.id, creatorName: user.name, ...parsed.data });
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "One or more invited users do not exist" }, { status: 400 });
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

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const events = await listCalendarEvents(pool, parsed.data);
  return NextResponse.json({ events });
}
