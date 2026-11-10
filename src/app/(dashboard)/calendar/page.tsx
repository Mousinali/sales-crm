import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listCalendarEvents } from "@/lib/calendar/crud";
import PageHeading from "@/components/ui/PageHeading";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  const user = await requireUser();
  const events = await listCalendarEvents(pool, {});

  return (
    <div>
      <PageHeading title="Calendar" crumbs={[{ label: "Calendar" }]} />
      <CalendarView
        initialEvents={events.map((e) => ({ ...e, starts_at: e.starts_at.toISOString() }))}
        viewerId={user.id}
      />
    </div>
  );
}
