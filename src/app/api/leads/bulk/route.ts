import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { listServices } from "@/lib/services/list";
import { createLead } from "@/lib/leads/create";
import { parseBulkLeadFile, type BulkRowError } from "@/lib/leads/bulkImport";
import { LeadActionNotAllowedError } from "@/lib/leads/errors";

// Matches the limit advertised on the upload page. Generous rather than tuned:
// real files are thousands of rows, not hundreds of thousands.
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = /\.(csv|xlsx|xls)$/i;

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Same roles that may create a lead one at a time.
  if (user.role !== "MARKETING_HEAD" && user.role !== "PRE_SALES" && user.role !== "SALESPERSON") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a CSV or Excel file." }, { status: 400 });
  }
  if (!ALLOWED.test(file.name)) {
    return NextResponse.json({ error: "Only .csv, .xlsx and .xls files are accepted." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is larger than the 100MB limit." }, { status: 413 });
  }

  const services = await listServices(pool, { status: "ACTIVE" });
  const idByName = new Map(services.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const { rows, errors } = await parseBulkLeadFile(file, services.map((s) => s.name));
  const failures: BulkRowError[] = [...errors];
  let imported = 0;

  // Row at a time so one bad row can't abort the rest — the whole point of
  // reporting failures instead of rejecting the file.
  for (const row of rows) {
    try {
      await createLead(pool, {
        creatorId: user.id,
        creatorRole: user.role,
        companyName: row.companyName,
        phone: row.phone,
        leadSource: row.leadSource,
        serviceIds: row.serviceNames.map((n) => idByName.get(n.trim().toLowerCase())!).filter(Boolean),
        contactPerson: row.contactPerson,
        designation: row.designation,
        email: row.email,
        website: row.website,
        whatsappNumber: row.whatsappNumber,
        industry: row.industry,
        businessType: row.businessType,
        address: row.address,
        state: row.state,
        pincode: row.pincode,
        country: row.country,
        gstNumber: row.gstNumber,
        estimatedBudget: row.estimatedBudget,
        budgetType: row.budgetType,
        priority: row.priority,
        notes: row.notes,
      });
      imported++;
    } catch (error) {
      const reason =
        error instanceof LeadActionNotAllowedError
          ? error.message
          : error instanceof Error && /unique|duplicate/i.test(error.message)
            ? "A lead with this phone or company already exists."
            : "Could not save this row.";
      failures.push({ row: row.row, company: row.companyName, reason });
    }
  }

  return NextResponse.json({
    imported,
    failed: failures.length,
    total: rows.length + errors.length,
    errors: failures.slice(0, 200),
    truncated: failures.length > 200,
  });
}
