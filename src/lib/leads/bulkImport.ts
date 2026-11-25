import ExcelJS from "exceljs";
import { LEAD_SOURCES, LEAD_PRIORITIES, LEAD_BUDGET_TYPES } from "./types";
import type { LeadSource, LeadPriority, LeadBudgetType } from "./types";
import { isValidPhone, isValidEmail, isValidPincode, MAX_AMOUNT, PHONE_MESSAGE, PINCODE_MESSAGE } from "@/lib/validation";

/**
 * Column order of the sample file. Everything after `Lead source` is optional,
 * so a minimal upload is three columns wide.
 */
export const BULK_COLUMNS = [
  "Company name",
  "Phone",
  "Lead source",
  "Services",
  "Contact person",
  "Designation",
  "Email",
  "Website",
  "WhatsApp number",
  "Industry",
  "Business type",
  "Address",
  "State",
  "Pincode",
  "Country",
  "GST number",
  "Estimated budget",
  "Budget type",
  "Priority",
  "Remarks",
] as const;

export const SAMPLE_ROWS: string[][] = [
  [
    "Aurora Textiles", "9876500011", "WEBSITE_ENQUIRY", "Bulk SMS; SEO Services",
    "Nisha Gupta", "Director", "nisha@aurora.example", "aurora.example", "9876500011",
    "Manufacturing", "B2B", "12 Mill Road", "West Bengal", "700001", "India",
    "19AAAAA0000A1Z5", "180000", "ONE_TIME", "HIGH", "Asked for a callback on Monday",
  ],
  [
    "Lotus Hospitals", "9876500012", "GOOGLE_ADS", "Website Development",
    "Dr Reena Das", "Administrator", "reena@lotus.example", "", "",
    "Healthcare", "", "", "Karnataka", "560001", "India",
    "", "420000", "PART_PAYMENT", "MEDIUM", "",
  ],
];

export type BulkRowError = { row: number; company: string; reason: string };

export type ParsedBulkRow = {
  row: number;
  companyName: string;
  phone: string;
  leadSource: LeadSource;
  serviceNames: string[];
  contactPerson?: string;
  designation?: string;
  email?: string;
  website?: string;
  whatsappNumber?: string;
  industry?: string;
  businessType?: string;
  address?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstNumber?: string;
  estimatedBudget?: number;
  budgetType?: LeadBudgetType;
  priority?: LeadPriority;
  notes?: string;
};

export type BulkParseResult = { rows: ParsedBulkRow[]; errors: BulkRowError[] };

/**
 * Splits one CSV line, honouring quoted fields so an address containing a comma
 * doesn't shift every later column.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(field); field = ""; }
    else field += ch;
  }
  out.push(field);
  return out.map((f) => f.trim());
}

function toGrid(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map(splitCsvLine);
}

/** The upload is named like a workbook but isn't one (corrupt, or an old binary .xls). */
export class UnreadableFileError extends Error {}

async function xlsxToGrid(buffer: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new UnreadableFileError("That file could not be read as an Excel workbook.");
  }
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const grid: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as unknown[];
    // exceljs pads index 0, so the row array is 1-based.
    grid.push(values.slice(1).map((v) => (v == null ? "" : String(typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v).trim())));
  });
  return grid.filter((r) => r.some((c) => c !== ""));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");

/**
 * Maps the uploaded header row onto known columns, so a file whose columns are
 * reordered (or carries extra ones) still imports rather than being rejected.
 */
function headerIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((h, i) => map.set(norm(h), i));
  return map;
}

export async function parseBulkLeadFile(
  file: { name: string; arrayBuffer: () => Promise<ArrayBuffer> },
  knownServiceNames: string[],
): Promise<BulkParseResult> {
  const isExcel = /\.xlsx?$/i.test(file.name);
  const buf = await file.arrayBuffer();
  const grid = isExcel ? await xlsxToGrid(buf) : toGrid(new TextDecoder().decode(buf));

  if (grid.length === 0) return { rows: [], errors: [{ row: 0, company: "", reason: "The file is empty." }] };

  const idx = headerIndex(grid[0]);
  const need = (name: string) => idx.get(norm(name));
  if (need("Company name") === undefined || need("Phone") === undefined) {
    return {
      rows: [],
      errors: [{ row: 1, company: "", reason: "Header row must include at least 'Company name' and 'Phone'. Download the sample file for the expected columns." }],
    };
  }

  const servicesByNorm = new Map(knownServiceNames.map((n) => [norm(n), n]));
  const rows: ParsedBulkRow[] = [];
  const errors: BulkRowError[] = [];
  const seenPhones = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    // +1 so the number matches what the spreadsheet shows the person.
    const rowNumber = r + 1;
    const cells = grid[r];
    const get = (name: string) => {
      const i = need(name);
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };

    const companyName = get("Company name");
    // Spreadsheets carry "+91 98765-43210" style numbers; keep the digits.
    const phone = get("Phone").replace(/[\s\-()+.]/g, "");
    const fail = (reason: string) => errors.push({ row: rowNumber, company: companyName || "(blank)", reason });

    if (!companyName) { fail("Company name is required."); continue; }
    if (!phone) { fail("Phone is required."); continue; }
    if (!isValidPhone(phone)) { fail(`Phone "${get("Phone")}" is not valid. ${PHONE_MESSAGE}`); continue; }
    const whatsapp = get("WhatsApp number").replace(/[\s\-()+.]/g, "");
    if (whatsapp && !isValidPhone(whatsapp)) { fail(`WhatsApp number "${get("WhatsApp number")}" is not valid. ${PHONE_MESSAGE}`); continue; }
    if (get("Email") && !isValidEmail(get("Email"))) { fail(`Email "${get("Email")}" is not valid.`); continue; }
    if (get("Pincode") && !isValidPincode(get("Pincode"))) { fail(`Pincode "${get("Pincode")}" is not valid. ${PINCODE_MESSAGE}`); continue; }
    if (seenPhones.has(phone)) { fail(`Duplicate phone "${phone}" earlier in this file.`); continue; }

    const sourceRaw = get("Lead source");
    const source = (sourceRaw ? sourceRaw.toUpperCase().replace(/[\s-]+/g, "_") : "OTHER") as LeadSource;
    if (!LEAD_SOURCES.includes(source)) {
      fail(`Unknown lead source "${sourceRaw}". Allowed: ${LEAD_SOURCES.join(", ")}`);
      continue;
    }

    // Services are given by name; at least one must resolve because a lead
    // cannot be created without one.
    const serviceNames: string[] = [];
    const rawServices = get("Services");
    if (rawServices) {
      for (const part of rawServices.split(/[;,|]/).map((s) => s.trim()).filter(Boolean)) {
        const match = servicesByNorm.get(norm(part));
        if (!match) { serviceNames.length = 0; fail(`Unknown service "${part}".`); break; }
        serviceNames.push(match);
      }
      if (serviceNames.length === 0) continue;
    } else {
      fail("At least one service is required in the 'Services' column.");
      continue;
    }

    const budgetRaw = get("Estimated budget").replace(/[,\s₹]/g, "");
    const estimatedBudget = budgetRaw ? Number(budgetRaw) : undefined;
    if (budgetRaw && !(estimatedBudget! >= 0 && estimatedBudget! <= MAX_AMOUNT)) { fail(`Estimated budget "${get("Estimated budget")}" is not a valid amount.`); continue; }

    const budgetRawType = get("Budget type").toUpperCase().replace(/[\s-]+/g, "_");
    if (budgetRawType && !LEAD_BUDGET_TYPES.includes(budgetRawType as LeadBudgetType)) {
      fail(`Unknown budget type "${get("Budget type")}". Allowed: ${LEAD_BUDGET_TYPES.join(", ")}`);
      continue;
    }
    const priorityRaw = get("Priority").toUpperCase();
    if (priorityRaw && !LEAD_PRIORITIES.includes(priorityRaw as LeadPriority)) {
      fail(`Unknown priority "${get("Priority")}". Allowed: ${LEAD_PRIORITIES.join(", ")}`);
      continue;
    }

    seenPhones.add(phone);
    rows.push({
      row: rowNumber,
      companyName,
      phone,
      leadSource: source,
      serviceNames,
      contactPerson: get("Contact person") || undefined,
      designation: get("Designation") || undefined,
      email: get("Email") || undefined,
      website: get("Website") || undefined,
      whatsappNumber: whatsapp || undefined,
      industry: get("Industry") || undefined,
      businessType: get("Business type") || undefined,
      address: get("Address") || undefined,
      state: get("State") || undefined,
      pincode: get("Pincode") || undefined,
      country: get("Country") || undefined,
      gstNumber: get("GST number") || undefined,
      estimatedBudget,
      budgetType: (budgetRawType || undefined) as LeadBudgetType | undefined,
      priority: (priorityRaw || undefined) as LeadPriority | undefined,
      notes: get("Remarks") || undefined,
    });
  }

  return { rows, errors };
}

/** The error report offered back as a download after an import. */
export function errorsToCsv(errors: BulkRowError[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return ["Row,Company,Reason", ...errors.map((e) => [e.row, esc(e.company), esc(e.reason)].join(","))].join("\n");
}
