import type { Pool } from "pg";
import { getIO } from "@/lib/socket";
import { CalendarEventNotFoundError, CalendarEventNotAccessibleError } from "./errors";
import type { AttendeeStatus, CalendarEventAttendee, CalendarEventRow, CalendarEventType } from "./types";

// One INSERT per recipient, each re-checking the user still exists at
// insert time (`WHERE id = $2`, not a hardcoded value): a recipient deleted
// between resolving the recipient list and this insert just matches zero
// rows instead of raising an FK violation. Done per-recipient rather than
// one multi-row statement because a single INSERT is all-or-nothing in
// Postgres — one stale id in a batched insert would silently drop every
// other recipient's notification too, not just that one.
//
// That existence re-check closes the common case, but not a narrower one:
// Postgres's FK trigger does its own fresh lookup at insert time, so a
// recipient deleted in the instant between our SELECT and that trigger's
// check can still raise 23503 (confirmed live, not just theoretical — this
// is exactly the swallow `chat/crud.ts`'s `notifyOne` already does). Without
// this catch, that one stale recipient throws out of `createCalendarEvent`
// entirely, leaving an already-committed `calendar_events` row the caller
// never got an id back for to clean up.
async function notifyOne(pool: Pool, recipientId: number, message: string): Promise<void> {
  try {
    const { rows } = await pool.query<{ id: number; recipient_user_id: number; type: string; message: string; read_at: Date | null; created_at: Date }>(
      `INSERT INTO notifications (recipient_user_id, type, message)
       SELECT id, 'CALENDAR_EVENT', $1 FROM users WHERE status = 'ACTIVE' AND id = $2
       RETURNING *`,
      [message, recipientId],
    );
    // `rows` is empty if the recipient vanished between resolving who to
    // notify and this insert (see above) — nothing to push in that case.
    if (rows.length > 0) {
      getIO()?.to(`user:${rows[0].recipient_user_id}`).emit("notification:new", rows[0]);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23503") return;
    throw error;
  }
}

// Notifies specific users (the invited attendees) with a personalized message.
async function notifyUsers(pool: Pool, userIds: number[], message: string): Promise<void> {
  await Promise.all(userIds.map((id) => notifyOne(pool, id, message)));
}

// Broadcasts to every other active user, excluding the actor and anyone
// already notified individually as an invited attendee.
async function notifyOthers(pool: Pool, excludeUserIds: number[], message: string): Promise<void> {
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM users WHERE status = 'ACTIVE' AND id != ALL($1)",
    [excludeUserIds],
  );
  await Promise.all(rows.map((row) => notifyOne(pool, row.id, message)));
}

// Diffs the attendee list rather than delete-then-reinsert: an attendee who
// stays on the list keeps their row (and with it their status/remarks) —
// otherwise every unrelated edit (the form always resubmits the full invite
// list) would silently wipe everyone's completion status and remarks.
async function setAttendees(pool: Pool, eventId: number, userIds: number[]): Promise<void> {
  const { rows: existingRows } = await pool.query<{ user_id: number }>(
    "SELECT user_id FROM calendar_event_attendees WHERE event_id = $1",
    [eventId],
  );
  const existingIds = existingRows.map((row) => row.user_id);
  const toRemove = existingIds.filter((id) => !userIds.includes(id));
  const toAdd = userIds.filter((id) => !existingIds.includes(id));

  if (toRemove.length > 0) {
    await pool.query("DELETE FROM calendar_event_attendees WHERE event_id = $1 AND user_id = ANY($2)", [eventId, toRemove]);
  }
  if (toAdd.length > 0) {
    await pool.query(
      `INSERT INTO calendar_event_attendees (event_id, user_id) SELECT $1, unnest($2::bigint[])`,
      [eventId, toAdd],
    );
  }
}

async function attendeesFor(pool: Pool, eventIds: number[]): Promise<Map<number, CalendarEventAttendee[]>> {
  const byEvent = new Map<number, CalendarEventAttendee[]>();
  if (eventIds.length === 0) return byEvent;
  const { rows } = await pool.query<{ event_id: number; user_id: number; status: AttendeeStatus; remarks: string | null }>(
    "SELECT event_id, user_id, status, remarks FROM calendar_event_attendees WHERE event_id = ANY($1)",
    [eventIds],
  );
  for (const row of rows) {
    const list = byEvent.get(row.event_id) ?? [];
    list.push({ user_id: row.user_id, status: row.status, remarks: row.remarks });
    byEvent.set(row.event_id, list);
  }
  return byEvent;
}

export async function createCalendarEvent(
  pool: Pool,
  input: {
    creatorId: number;
    creatorName: string;
    title: string;
    description?: string;
    type?: CalendarEventType;
    startsAt: Date;
    attendeeUserIds?: number[];
  },
): Promise<CalendarEventRow> {
  const { rows } = await pool.query<Omit<CalendarEventRow, "attendees">>(
    `INSERT INTO calendar_events (title, description, type, starts_at, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.title, input.description ?? null, input.type ?? "MEETING", input.startsAt, input.creatorId],
  );
  const event = rows[0];

  const attendeeIds = [...new Set(input.attendeeUserIds ?? [])].filter((id) => id !== input.creatorId);
  await setAttendees(pool, event.id, attendeeIds);

  const when = event.starts_at.toLocaleString("en-US");
  if (attendeeIds.length > 0) {
    await notifyUsers(pool, attendeeIds, `${input.creatorName} invited you to "${event.title}" (${when})`);
  }
  await notifyOthers(pool, [input.creatorId, ...attendeeIds], `${input.creatorName} scheduled "${event.title}" for ${when}`);

  return { ...event, attendees: attendeeIds.map((userId) => ({ user_id: userId, status: "PENDING", remarks: null })) };
}

export async function listCalendarEvents(
  pool: Pool,
  filters: { from?: Date; to?: Date },
): Promise<CalendarEventRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.from) {
    params.push(filters.from);
    conditions.push(`starts_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    conditions.push(`starts_at <= $${params.length}`);
  }

  const { rows } = await pool.query<Omit<CalendarEventRow, "attendees">>(
    `SELECT * FROM calendar_events ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY starts_at`,
    params,
  );
  const attendeesByEvent = await attendeesFor(pool, rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, attendees: attendeesByEvent.get(row.id) ?? [] }));
}

export async function updateCalendarEvent(
  pool: Pool,
  input: {
    actorId: number;
    actorName: string;
    eventId: number;
    title?: string;
    description?: string;
    type?: CalendarEventType;
    startsAt?: Date;
    attendeeUserIds?: number[];
  },
): Promise<CalendarEventRow> {
  const { rows: existingRows } = await pool.query<Omit<CalendarEventRow, "attendees">>(
    "SELECT * FROM calendar_events WHERE id = $1",
    [input.eventId],
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new CalendarEventNotFoundError(`No calendar event with id ${input.eventId}`);
  }

  const columns: string[] = [];
  const params: unknown[] = [];
  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }
  if (input.title !== undefined) set("title", input.title);
  if (input.description !== undefined) set("description", input.description);
  if (input.type !== undefined) set("type", input.type);
  if (input.startsAt !== undefined) set("starts_at", input.startsAt);

  let updated: Omit<CalendarEventRow, "attendees"> = existing;
  if (columns.length > 0) {
    params.push(input.eventId);
    const { rows } = await pool.query<Omit<CalendarEventRow, "attendees">>(
      `UPDATE calendar_events SET ${columns.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    updated = rows[0];
  }

  const existingAttendees = (await attendeesFor(pool, [input.eventId])).get(input.eventId) ?? [];
  const existingAttendeeIds = existingAttendees.map((a) => a.user_id);

  let attendees = existingAttendees;
  if (input.attendeeUserIds !== undefined) {
    const newAttendeeIds = [...new Set(input.attendeeUserIds)].filter((id) => id !== updated.created_by);
    await setAttendees(pool, input.eventId, newAttendeeIds);
    attendees = (await attendeesFor(pool, [input.eventId])).get(input.eventId) ?? [];

    const newlyAdded = newAttendeeIds.filter((id) => !existingAttendeeIds.includes(id));
    if (newlyAdded.length > 0) {
      const when = updated.starts_at.toLocaleString("en-US");
      await notifyUsers(pool, newlyAdded, `${input.actorName} invited you to "${updated.title}" (${when})`);
    }
  }

  if (columns.length > 0) {
    await notifyOthers(pool, [input.actorId, ...attendees.map((a) => a.user_id)], `${input.actorName} updated "${updated.title}"`);
  }

  return { ...updated, attendees };
}

export async function deleteCalendarEvent(
  pool: Pool,
  input: { actorId: number; actorName: string; eventId: number },
): Promise<void> {
  const { rows: existingRows } = await pool.query<Omit<CalendarEventRow, "attendees">>(
    "SELECT * FROM calendar_events WHERE id = $1",
    [input.eventId],
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new CalendarEventNotFoundError(`No calendar event with id ${input.eventId}`);
  }
  if (existing.created_by !== input.actorId) {
    throw new CalendarEventNotAccessibleError(`User ${input.actorId} cannot delete event ${input.eventId}`);
  }

  const attendeeIds = ((await attendeesFor(pool, [input.eventId])).get(input.eventId) ?? []).map((a) => a.user_id);
  await pool.query("DELETE FROM calendar_events WHERE id = $1", [input.eventId]);
  await notifyOthers(pool, [input.actorId, ...attendeeIds], `${input.actorName} deleted "${existing.title}"`);
  if (attendeeIds.length > 0) {
    await notifyUsers(pool, attendeeIds, `${input.actorName} cancelled "${existing.title}"`);
  }
}

// An invited attendee's own response to the event: whether they've
// completed their part, and a free-text remark (e.g. a Pre-sales/Sales
// concern). Only something the attendee themselves can set, and it notifies
// the event's creator rather than broadcasting to everyone.
export async function respondToCalendarEvent(
  pool: Pool,
  input: { actorId: number; actorName: string; eventId: number; status?: AttendeeStatus; remarks?: string },
): Promise<CalendarEventAttendee> {
  const { rows: attendeeRows } = await pool.query<{ user_id: number; status: AttendeeStatus; remarks: string | null }>(
    "SELECT user_id, status, remarks FROM calendar_event_attendees WHERE event_id = $1 AND user_id = $2",
    [input.eventId, input.actorId],
  );
  if (attendeeRows.length === 0) {
    throw new CalendarEventNotAccessibleError(`User ${input.actorId} is not an attendee of event ${input.eventId}`);
  }

  const columns: string[] = [];
  const params: unknown[] = [];
  function set(column: string, value: unknown) {
    params.push(value);
    columns.push(`${column} = $${params.length}`);
  }
  if (input.status !== undefined) set("status", input.status);
  if (input.remarks !== undefined) set("remarks", input.remarks);

  let updated = attendeeRows[0];
  if (columns.length > 0) {
    params.push(input.eventId, input.actorId);
    const { rows } = await pool.query<{ user_id: number; status: AttendeeStatus; remarks: string | null }>(
      `UPDATE calendar_event_attendees SET ${columns.join(", ")}
       WHERE event_id = $${params.length - 1} AND user_id = $${params.length} RETURNING user_id, status, remarks`,
      params,
    );
    updated = rows[0];
  }

  const { rows: eventRows } = await pool.query<{ title: string; created_by: number }>(
    "SELECT title, created_by FROM calendar_events WHERE id = $1",
    [input.eventId],
  );
  const event = eventRows[0];
  if (event && event.created_by !== input.actorId) {
    const parts: string[] = [];
    if (input.status === "COMPLETED") parts.push("marked their part complete");
    if (input.remarks !== undefined) parts.push(`left a remark: "${input.remarks}"`);
    if (parts.length > 0) {
      await notifyOne(pool, event.created_by, `${input.actorName} ${parts.join(" and ")} for "${event.title}"`);
    }
  }

  return updated;
}
