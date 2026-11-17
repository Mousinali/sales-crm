import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth/rbac";
import { pool } from "@/lib/db";
import { listServices } from "@/lib/services/list";
import { BULK_COLUMNS, SAMPLE_ROWS } from "@/lib/leads/bulkImport";
import { LEAD_SOURCES, LEAD_PRIORITIES, LEAD_BUDGET_TYPES } from "@/lib/leads/types";

export async function GET(request: Request): Promise<Response> {
  const user = await getCurrentUserFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.mustChangePassword) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  // The live service names go in the sample so the file can be filled in
  // without having to look them up elsewhere.
  const serviceNames = (await listServices(pool, { status: "ACTIVE" })).map((s) => s.name);

  if (format === "csv") {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const body = [BULK_COLUMNS.join(","), ...SAMPLE_ROWS.map((r) => r.map(esc).join(","))].join("\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="lead-upload-sample.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Leads");
  sheet.addRow([...BULK_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  SAMPLE_ROWS.forEach((r) => sheet.addRow(r));
  BULK_COLUMNS.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(14, c.length + 4);
  });

  // A second sheet listing the accepted values, so the enums don't have to be
  // guessed or remembered.
  const ref = wb.addWorksheet("Allowed values");
  ref.addRow(["Column", "Accepted values"]);
  ref.getRow(1).font = { bold: true };
  ref.addRow(["Lead source", LEAD_SOURCES.join(", ")]);
  ref.addRow(["Priority", LEAD_PRIORITIES.join(", ")]);
  ref.addRow(["Budget type", LEAD_BUDGET_TYPES.join(", ")]);
  ref.addRow(["Services", serviceNames.join(", ")]);
  ref.getColumn(1).width = 18;
  ref.getColumn(2).width = 120;

  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lead-upload-sample.xlsx"`,
    },
  });
}
