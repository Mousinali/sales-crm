import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { LEAD_SOURCES, LEAD_PRIORITIES, LEAD_STATUSES, LEAD_BUDGET_TYPES } from "@/lib/leads/types";
import { createLead } from "@/lib/leads/create";
import { listLeadsPage, LEAD_SORT_COLUMNS } from "@/lib/leads/list";
import { parsePageParams } from "@/lib/pagination";
import { listLeadServices } from "@/lib/leads/services";
import { LeadActionNotAllowedError } from "@/lib/leads/errors";

const createLeadSchema = z.object({
  companyName: z.string().trim().min(1),
  contactPerson: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  website: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  businessType: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  pincode: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  gstNumber: z.string().trim().min(1).optional(),
  serviceRequirements: z.string().trim().min(1).optional(),
  serviceIds: z.array(z.number().int()).min(1),
  estimatedBudget: z.number().optional(),
  budgetType: z.enum(LEAD_BUDGET_TYPES).optional(),
  leadSource: z.enum(LEAD_SOURCES),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  notes: z.string().trim().min(1).optional(),
  whatsappNumber: z.string().trim().min(1).optional(),
  remarks: z.string().trim().min(1).optional(),
  youtubeUrl: z.string().trim().url().optional(),
  facebookUrl: z.string().trim().url().optional(),
  instagramUrl: z.string().trim().url().optional(),
  linkedinUrl: z.string().trim().url().optional(),
});

const listQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  ownerId: z.coerce.number().int().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  includeArchived: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  archivedOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  sortBy: z.enum(LEAD_SORT_COLUMNS).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
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
    const services = await listLeadServices(pool, lead.id);
    return NextResponse.json({ ...lead, services }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadActionNotAllowedError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    source: url.searchParams.get("source") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    ownerId: url.searchParams.get("ownerId") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    includeArchived: url.searchParams.get("includeArchived") ?? undefined,
    archivedOnly: url.searchParams.get("archivedOnly") ?? undefined,
    sortBy: url.searchParams.get("sortBy") ?? undefined,
    sortDir: url.searchParams.get("sortDir") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // The Archive page (archived/deleted leads) is Super-Admin-only.
  if (parsed.data.archivedOnly && user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sortBy, sortDir, ...filters } = parsed.data;
  const page = parsePageParams(url.searchParams);
  const result = await listLeadsPage(pool, user, filters, page, { sortBy, sortDir });
  return NextResponse.json({ leads: result.items, page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages });
}
