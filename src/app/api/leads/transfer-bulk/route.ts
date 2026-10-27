import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { bulkTransferLeads } from "@/lib/leads/transfer";
import {
  LeadNotFoundError,
  LeadNotAccessibleError,
  LeadActionNotAllowedError,
  InvalidLeadReasonError,
} from "@/lib/leads/errors";

const bulkTransferSchema = z.object({
  leadIds: z.array(z.number().int()).min(1),
  newPreSalesOwnerId: z.number().int().optional(),
  newSalespersonOwnerId: z.number().int().optional(),
  reason: z.string(),
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
  const parsed = bulkTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const leads = await bulkTransferLeads(pool, {
      actorId: user.id,
      actorRole: user.role,
      leadIds: parsed.data.leadIds,
      newPreSalesOwnerId: parsed.data.newPreSalesOwnerId,
      newSalespersonOwnerId: parsed.data.newSalespersonOwnerId,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ leads });
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
