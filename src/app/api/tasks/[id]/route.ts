import { NextResponse } from "next/server";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { LEAD_PRIORITIES } from "@/lib/leads/types";
import { TASK_STATUSES } from "@/lib/tasks/types";
import { updateTask } from "@/lib/tasks/crud";
import { TaskNotFoundError, TaskNotAccessibleError, TaskActionNotAllowedError } from "@/lib/tasks/errors";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";

const patchSchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    dueAt: z.coerce.date().optional(),
    priority: z.enum(LEAD_PRIORITIES).optional(),
    assignedUserId: z.number().int().optional(),
    leadId: z.number().int().nullable().optional(),
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
  const taskId = Number(id);
  if (!Number.isSafeInteger(taskId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const task = await updateTask(pool, { actorId: user.id, actorRole: user.role, taskId, ...parsed.data });
    await logActivity(pool, { actorUserId: user.id, action: "task.updated", targetTable: "tasks", targetId: taskId, details: { name: task.title } });
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof TaskNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof TaskActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof TaskNotFoundError || error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
