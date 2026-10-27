import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listTasks } from "@/lib/tasks/crud";
import TasksView from "./TasksView";

export default async function TasksPage() {
  const user = await requireUser();
  if (user.role === "HR") {
    redirect("/dashboard");
  }

  const tasks = await listTasks(pool, user, {});

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">Tasks</h1>
      <TasksView
        initialTasks={tasks.map((t) => ({ ...t, due_at: t.due_at.toISOString() }))}
        viewerId={user.id}
        viewerRole={user.role}
      />
    </div>
  );
}
