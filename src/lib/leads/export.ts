import ExcelJS from "exceljs";
import type { LeadRow } from "./types";
import { LEAD_STATUS_LABELS, LEAD_PRIORITY_LABELS } from "@/app/(dashboard)/leadDisplay";

// `service_requirements` is a free-text column the New Lead form never
// populates — what the form actually captures as "Service interested" is
// the lead_services join (service names), so export needs that joined-in
// alongside the row, not the always-empty text column.
export type LeadExportRow = LeadRow & { serviceNames: string };

const EXPORT_COLUMNS: { header: string; value: (lead: LeadExportRow) => string }[] = [
  { header: "Company", value: (l) => l.company_name },
  { header: "Contact Person", value: (l) => l.contact_person ?? "" },
  { header: "Phone", value: (l) => l.phone },
  { header: "Email", value: (l) => l.email ?? "" },
  { header: "Website", value: (l) => l.website ?? "" },
  { header: "Address", value: (l) => l.address ?? "" },
  { header: "Location", value: (l) => l.location ?? "" },
  { header: "State", value: (l) => l.state ?? "" },
  { header: "Pincode", value: (l) => l.pincode ?? "" },
  { header: "Country", value: (l) => l.country },
  { header: "Source", value: (l) => l.lead_source },
  { header: "Priority", value: (l) => LEAD_PRIORITY_LABELS[l.priority] },
  { header: "Status", value: (l) => LEAD_STATUS_LABELS[l.status] },
  { header: "Services", value: (l) => l.serviceNames },
  { header: "Estimated Budget", value: (l) => l.estimated_budget ?? "" },
  { header: "Created At", value: (l) => new Date(l.created_at).toISOString() },
];

// Lead fields (company_name, notes, etc.) are user-supplied. Excel/Sheets
// treat a cell starting with =, +, -, @ (or a tab/CR) as a formula, so an
// unescaped lead field could run arbitrary formulas — including shelling
// out via =cmd|... — on whoever opens the exported file. Prefixing with an
// apostrophe forces it to be read as literal text in every spreadsheet app.
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function leadsToCsv(leads: LeadExportRow[]): string {
  const lines = [EXPORT_COLUMNS.map((c) => csvEscape(c.header)).join(",")];
  for (const lead of leads) {
    lines.push(EXPORT_COLUMNS.map((c) => csvEscape(neutralizeFormula(c.value(lead)))).join(","));
  }
  return lines.join("\r\n");
}

export async function leadsToXlsxBuffer(leads: LeadExportRow[]): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.addRow(EXPORT_COLUMNS.map((c) => c.header));
  for (const lead of leads) {
    sheet.addRow(EXPORT_COLUMNS.map((c) => neutralizeFormula(c.value(lead))));
  }
  return workbook.xlsx.writeBuffer();
}
