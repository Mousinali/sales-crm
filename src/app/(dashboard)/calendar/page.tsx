import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listCalendarEvents } from "@/lib/calendar/crud";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  const user = await requireUser();
  const events = await listCalendarEvents(pool, {});

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Calendar</h1>
      <CalendarView
        initialEvents={events.map((e) => ({ ...e, starts_at: e.starts_at.toISOString() }))}
        viewerId={user.id}
      />
    </div>
  );
}
