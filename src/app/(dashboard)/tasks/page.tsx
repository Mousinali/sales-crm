import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listTasksPage } from "@/lib/tasks/crud";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import TasksView from "./TasksView";

export default async function TasksPage() {
  const user = await requireUser();
  if (user.role === "HR") {
    redirect("/dashboard");
  }

  const result = await listTasksPage(pool, user, {}, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Tasks</h1>
      <TasksView
        initialTasks={result.items.map((t) => ({ ...t, due_at: t.due_at.toISOString() }))}
        initialTotal={result.total}
        initialTotalPages={result.totalPages}
        viewerId={user.id}
        viewerRole={user.role}
      />
    </div>
  );
}
