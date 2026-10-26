import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../../../lib/db";
import { getCurrentUserFromRequest } from "../../../../../lib/auth/rbac";
import { assignLead } from "../../../../../lib/leads/assign";
import { LeadNotFoundError, LeadNotAccessibleError, LeadActionNotAllowedError } from "../../../../../lib/leads/errors";

const assignSchema = z
  .object({
    salespersonId: z.number().int().optional(),
    preSalesOwnerId: z.number().int().optional(),
  })
  .refine((data) => data.salespersonId !== undefined || data.preSalesOwnerId !== undefined, {
    message: "At least one of salespersonId or preSalesOwnerId is required",
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
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const lead = await assignLead(pool, {
      actorId: user.id,
      actorRole: user.role,
      leadId,
      salespersonId: parsed.data.salespersonId,
      preSalesOwnerId: parsed.data.preSalesOwnerId,
    });
    return NextResponse.json(lead);
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof LeadNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}
