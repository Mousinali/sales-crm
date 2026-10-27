import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { LEAD_PRIORITIES } from "@/lib/leads/types";
import { assertLeadVisible } from "@/lib/leads/guard";
import { updateLead } from "@/lib/leads/update";
import { listLeadServices } from "@/lib/leads/services";
import { LeadNotFoundError, LeadNotAccessibleError, LeadActionNotAllowedError } from "@/lib/leads/errors";

const updateLeadSchema = z
  .object({
    companyName: z.string().trim().min(1).optional(),
    contactPerson: z.string().trim().min(1).optional(),
    designation: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    website: z.string().trim().min(1).optional(),
    industry: z.string().trim().min(1).optional(),
    businessType: z.string().trim().min(1).optional(),
    location: z.string().trim().min(1).optional(),
    address: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    pincode: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    serviceRequirements: z.string().trim().min(1).optional(),
    serviceIds: z.array(z.number().int()).min(1).optional(),
    estimatedBudget: z.number().optional(),
    priority: z.enum(LEAD_PRIORITIES).optional(),
    nextFollowUpAt: z.coerce.date().optional(),
    notes: z.string().trim().min(1).optional(),
    whatsappNumber: z.string().trim().min(1).optional(),
    remarks: z.string().trim().min(1).optional(),
    archived: z.literal(true).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields to update" });

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
    const lead = await assertLeadVisible(pool, user, leadId);
    const services = await listLeadServices(pool, leadId);
    return NextResponse.json({ ...lead, services });
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadNotAccessibleError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw error;
  }
}

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
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    await updateLead(pool, { actorId: user.id, actorRole: user.role, leadId, fields: parsed.data });
    return NextResponse.json({ ok: true });
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
