import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { LEAD_PRIORITIES } from "@/lib/leads/types";
import { TASK_STATUSES } from "@/lib/tasks/types";
import { createTask, listTasks } from "@/lib/tasks/crud";
import { TaskActionNotAllowedError } from "@/lib/tasks/errors";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";

const createTaskSchema = z.object({
  assignedUserId: z.number().int(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  dueAt: z.coerce.date(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  leadId: z.number().int().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  dueWithin: z.enum(["TODAY", "OVERDUE", "UPCOMING"]).optional(),
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
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const task = await createTask(pool, { creatorId: user.id, actorRole: user.role, ...parsed.data });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof TaskActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "Referenced user or lead does not exist" }, { status: 400 });
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
    status: url.searchParams.get("status") ?? undefined,
    dueWithin: url.searchParams.get("dueWithin") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const tasks = await listTasks(pool, user, parsed.data);
  return NextResponse.json({ tasks });
}
