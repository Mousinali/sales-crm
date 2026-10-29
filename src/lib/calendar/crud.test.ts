import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import path from "node:path";
import { pool } from "@/lib/db";
import { runMigrations } from "@/lib/migrate";
import { seedSuperAdmin } from "@/lib/auth/seed";
import { createUser } from "@/lib/users/create";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, respondToCalendarEvent } from "./crud";
import { CalendarEventNotAccessibleError, CalendarEventNotFoundError } from "./errors";
import { listNotifications } from "@/lib/notifications/record";

const adminEmail = `cal-admin-${Date.now()}@example.com`;
let creatorId: number;
let otherId: number;
let attendeeId: number;
const createdEmails: string[] = [];
const eventIds: number[] = [];

beforeAll(async () => {
  await runMigrations(pool, path.join(__dirname, "../../../migrations"));
  const adminId = (await seedSuperAdmin(pool, { email: adminEmail, name: "Admin", password: "1234" })).id;
  // HR and Marketing Head, not Pre-sales/Salesperson: announcement tests
  // (email/announce.test.ts) resolve ALL_PRE_SALES/ALL_SALESPERSON against
  // every active user of those roles system-wide, so a Pre-sales/Salesperson
  // user created here would be swept into their counts under a parallel
  // full-suite run.
  const hr = await createUser(pool, { creatorId: adminId, creatorRole: "SUPER_ADMIN", role: "HR", name: "HR", email: `cal-hr-${Date.now()}@example.com` });
  const mh = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH", email: `cal-mh-${Date.now()}@example.com` });
  const mh2 = await createUser(pool, { creatorId: hr.id, creatorRole: "HR", role: "MARKETING_HEAD", name: "MH2", email: `cal-mh2-${Date.now()}@example.com` });

  creatorId = hr.id;
  otherId = mh.id;
  attendeeId = mh2.id;
  createdEmails.push(hr.email, mh.email, mh2.email);
});

afterEach(async () => {
  // Our notifyOthers broadcasts to every active user system-wide, which in a
  // full test run includes other test files' own throwaway users. Clean
  // those rows up right away (type CALENDAR_EVENT is exclusive to this
  // feature) so a sibling file deleting its own user afterwards never hits
  // our leftover notification's FK reference.
  await pool.query("DELETE FROM notifications WHERE type = 'CALENDAR_EVENT'");
});

afterAll(async () => {
  await pool.query("DELETE FROM calendar_events WHERE id = ANY($1)", [eventIds]);
  await pool.query(
    "DELETE FROM audit_logs WHERE actor_user_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [[...createdEmails, adminEmail]],
  );
  await pool.query("DELETE FROM users WHERE email = ANY($1)", [[...createdEmails, adminEmail]]);
});

describe("calendar events", () => {
  it("creates an event and notifies every other active user", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Client call",
      type: "MEETING",
      startsAt: new Date("2026-11-05T10:00:00Z"),
    });
    eventIds.push(event.id);

    const otherNotifications = await listNotifications(pool, otherId);
    expect(otherNotifications[0]).toMatchObject({ type: "CALENDAR_EVENT" });
  });

  it("lets any user update an event created by someone else", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Original title",
      startsAt: new Date("2026-11-06T10:00:00Z"),
    });
    eventIds.push(event.id);

    const updated = await updateCalendarEvent(pool, { actorId: otherId, actorName: "MH", eventId: event.id, title: "Updated title" });
    expect(updated.title).toBe("Updated title");
  });

  it("rejects deleting an event you did not create", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Not yours",
      startsAt: new Date("2026-11-07T10:00:00Z"),
    });
    eventIds.push(event.id);

    await expect(deleteCalendarEvent(pool, { actorId: otherId, actorName: "MH", eventId: event.id })).rejects.toThrow(
      CalendarEventNotAccessibleError,
    );
  });

  it("notifies an invited attendee with a personalized message, distinct from the generic broadcast", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Planning session",
      startsAt: new Date("2026-11-09T10:00:00Z"),
      attendeeUserIds: [attendeeId],
    });
    eventIds.push(event.id);
    expect(event.attendees).toEqual([{ user_id: attendeeId, status: "PENDING", remarks: null }]);

    const attendeeNotifications = await listNotifications(pool, attendeeId);
    expect(attendeeNotifications[0].message).toContain("invited you");

    const otherNotifications = await listNotifications(pool, otherId);
    expect(otherNotifications[0].message).not.toContain("invited you");
    expect(otherNotifications[0].message).toContain("scheduled");
  });

  it("notifies a newly added attendee when attendees are added on update", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Review",
      startsAt: new Date("2026-11-10T10:00:00Z"),
    });
    eventIds.push(event.id);

    const updated = await updateCalendarEvent(pool, {
      actorId: creatorId,
      actorName: "HR",
      eventId: event.id,
      attendeeUserIds: [attendeeId],
    });
    expect(updated.attendees).toEqual([{ user_id: attendeeId, status: "PENDING", remarks: null }]);

    const attendeeNotifications = await listNotifications(pool, attendeeId);
    expect(attendeeNotifications[0].message).toContain("invited you");
  });

  it("lets an attendee mark their part complete and leave a remark, notifying the creator", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Scoping call",
      startsAt: new Date("2026-11-11T10:00:00Z"),
      attendeeUserIds: [attendeeId],
    });
    eventIds.push(event.id);

    const responded = await respondToCalendarEvent(pool, {
      actorId: attendeeId,
      actorName: "MH2",
      eventId: event.id,
      status: "COMPLETED",
      remarks: "Client wants a follow-up next week",
    });
    expect(responded).toEqual({ user_id: attendeeId, status: "COMPLETED", remarks: "Client wants a follow-up next week" });

    const creatorNotifications = await listNotifications(pool, creatorId);
    expect(creatorNotifications[0].message).toContain("marked their part complete");
    expect(creatorNotifications[0].message).toContain("Client wants a follow-up next week");
  });

  it("rejects a response from someone who isn't an attendee of the event", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Not invited",
      startsAt: new Date("2026-11-12T10:00:00Z"),
    });
    eventIds.push(event.id);

    await expect(
      respondToCalendarEvent(pool, { actorId: otherId, actorName: "MH", eventId: event.id, status: "COMPLETED" }),
    ).rejects.toThrow(CalendarEventNotAccessibleError);
  });

  it("preserves an attendee's status/remarks when the invite list is resubmitted unchanged", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Status check",
      startsAt: new Date("2026-11-13T10:00:00Z"),
      attendeeUserIds: [attendeeId],
    });
    eventIds.push(event.id);

    await respondToCalendarEvent(pool, {
      actorId: attendeeId,
      actorName: "MH2",
      eventId: event.id,
      status: "COMPLETED",
      remarks: "Already handled",
    });

    // Editing the title re-submits the same attendee list, as the UI always does.
    const updated = await updateCalendarEvent(pool, {
      actorId: creatorId,
      actorName: "HR",
      eventId: event.id,
      title: "Status check (renamed)",
      attendeeUserIds: [attendeeId],
    });
    expect(updated.attendees).toEqual([{ user_id: attendeeId, status: "COMPLETED", remarks: "Already handled" }]);
  });

  it("lets the creator delete their own event", async () => {
    const event = await createCalendarEvent(pool, {
      creatorId,
      creatorName: "HR",
      title: "Mine to delete",
      startsAt: new Date("2026-11-08T10:00:00Z"),
    });

    await deleteCalendarEvent(pool, { actorId: creatorId, actorName: "HR", eventId: event.id });
    await expect(updateCalendarEvent(pool, { actorId: creatorId, actorName: "HR", eventId: event.id, title: "x" })).rejects.toThrow(
      CalendarEventNotFoundError,
    );
  });
});
