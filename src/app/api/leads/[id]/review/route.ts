import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../../lib/auth/rbac";
import { reviewLead } from "../../../../../lib/leads/review";
import {
  LeadNotFoundError,
  LeadNotAccessibleError,
  LeadActionNotAllowedError,
  InvalidLeadReasonError,
} from "../../../../../lib/leads/errors";

const reviewSchema = z.object({
  action: z.enum(["QUALIFY", "REJECT", "RETURN"]),
  reason: z.string().trim().min(1).optional(),
});

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
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const lead = await reviewLead(pool, {
      actorId: user.id,
      actorRole: user.role,
      leadId,
      action: parsed.data.action,
      reason: parsed.data.reason,
    });
    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (error instanceof InvalidLeadReasonError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
