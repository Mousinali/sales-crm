import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { assertLeadVisible } from "@/lib/leads/guard";
import { LeadNotFoundError, LeadNotAccessibleError } from "@/lib/leads/errors";
import { scheduleVisit } from "@/lib/visits/schedule";
import { VisitActionNotAllowedError, VisitConflictError } from "@/lib/visits/errors";
import type { VisitRow } from "@/lib/visits/types";

const scheduleSchema = z.object({
  salespersonId: z.number().int(),
  visitDate: z.string().trim().min(1),
  startTime: z.string().trim().min(1),
  expectedDurationMinutes: z.number().int().optional(),
  location: z.string().optional(),
  objective: z.string().trim().min(1),
  preparationNotes: z.string().optional(),
  confirmConflict: z.boolean().optional(),
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
    await assertLeadVisible(pool, { id: user.id, role: user.role }, leadId);
    const { rows } = await pool.query<VisitRow>(
      "SELECT * FROM client_visits WHERE lead_id = $1 ORDER BY visit_date, start_time",
      [leadId],
    );
    return NextResponse.json({ visits: rows });
  } catch (error) {
    if (error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
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
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const visit = await scheduleVisit(pool, {
      actorId: user.id,
      actorRole: user.role,
      leadId,
      ...parsed.data,
    });
    return NextResponse.json(visit);
  } catch (error) {
    if (error instanceof VisitConflictError) {
      return NextResponse.json({ error: error.message, conflict: true }, { status: 409 });
    }
    if (error instanceof VisitActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
