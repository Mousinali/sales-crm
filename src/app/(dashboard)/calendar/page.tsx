import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listCalendarEvents } from "@/lib/calendar/crud";
import { listTasks } from "@/lib/tasks/crud";
import PageHeading from "@/components/ui/PageHeading";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  const user = await requireUser();
  const [events, tasks] = await Promise.all([listCalendarEvents(pool, {}), listTasks(pool, user, { mineOnly: true })]);

  return (
    <div>
      <PageHeading title="Calendar" crumbs={[{ label: "Calendar" }]} />
      <CalendarView
        initialEvents={events.map((e) => ({ ...e, starts_at: e.starts_at.toISOString() }))}
        initialTasks={tasks
          .filter((t) => t.status !== "CANCELLED")
          .map((t) => ({ id: t.id, title: t.title, due_at: t.due_at.toISOString(), status: t.status, assigned_user_name: t.assigned_user_name ?? null }))}
        viewerId={user.id}
      />
    </div>
  );
}
