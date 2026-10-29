import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { LEAD_SOURCES, LEAD_PRIORITIES, LEAD_STATUSES } from "@/lib/leads/types";
import { listLeads } from "@/lib/leads/list";
import { listServiceNamesForLeads } from "@/lib/leads/services";
import { leadsToCsv, leadsToXlsxBuffer, type LeadExportRow } from "@/lib/leads/export";

const exportQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  q: z.string().trim().min(1).optional(),
  format: z.enum(["csv", "xlsx"]).default("csv"),
  ids: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",").map(Number).filter(Number.isInteger) : undefined)),
});

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.mustChangePassword) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = exportQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    dateFrom: url.searchParams.get("dateFrom") ?? undefined,
    dateTo: url.searchParams.get("dateTo") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    format: url.searchParams.get("format") ?? undefined,
    ids: url.searchParams.get("ids") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const { format, ids, ...filters } = parsed.data;
  // listLeads already restricts rows to what this viewer's role is allowed
  // to see, so filtering by `ids` afterwards can only narrow that set, never
  // widen it to leads the viewer shouldn't have.
  const allLeads = await listLeads(pool, user, filters);
  const filteredLeads = ids ? allLeads.filter((lead) => ids.includes(lead.id)) : allLeads;
  const serviceNamesByLeadId = await listServiceNamesForLeads(pool, filteredLeads.map((l) => l.id));
  const leads: LeadExportRow[] = filteredLeads.map((lead) => ({
    ...lead,
    serviceNames: serviceNamesByLeadId.get(lead.id) ?? "",
  }));

  if (format === "xlsx") {
    const buffer = await leadsToXlsxBuffer(leads);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="leads.xlsx"`,
      },
    });
  }

  return new NextResponse(leadsToCsv(leads), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads.csv"`,
    },
  });
}
