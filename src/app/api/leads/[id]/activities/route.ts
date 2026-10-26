import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../../lib/auth/rbac";
import { assertLeadVisible } from "../../../../../lib/leads/guard";
import { recordLeadActivity, listLeadActivities } from "../../../../../lib/leads/activities";
import { LeadNotFoundError, LeadNotAccessibleError } from "../../../../../lib/leads/errors";

const postActivitySchema = z.object({
  type: z.enum(["NOTE", "CALL", "MEETING", "OTHER"]),
  notes: z.string().trim().min(1).optional(),
});

export async function GET(
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
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const activities = await listLeadActivities(pool, user, leadId);
    return NextResponse.json({ activities });
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

export async function POST(
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
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    await assertLeadVisible(pool, user, leadId);
    await recordLeadActivity(pool, { leadId, actorId: user.id, type: parsed.data.type, notes: parsed.data.notes });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
