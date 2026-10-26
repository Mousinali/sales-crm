import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../lib/db";
import { getCurrentUserFromRequest } from "../../../lib/auth/rbac";
import { LEAD_SOURCES, LEAD_PRIORITIES } from "../../../lib/leads/types";
import { createLead } from "../../../lib/leads/create";
import { LeadActionNotAllowedError } from "../../../lib/leads/errors";

const createLeadSchema = z.object({
  companyName: z.string().trim().min(1),
  contactPerson: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  website: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  serviceRequirements: z.string().trim().min(1),
  estimatedBudget: z.number().optional(),
  leadSource: z.enum(LEAD_SOURCES),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  notes: z.string().trim().min(1).optional(),
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
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const lead = await createLead(pool, {
      creatorId: user.id,
      creatorRole: user.role,
      ...parsed.data,
    });
    return NextResponse.json(lead, { status: 201 });
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
}
