import { describe, it, expect } from "vitest";
import { parseBulkLeadFile, splitCsvLine, errorsToCsv, BULK_COLUMNS } from "./bulkImport";

const SERVICES = ["Bulk SMS", "SEO Services", "Website Development"];

function csvFile(body: string, name = "leads.csv") {
  const bytes = new TextEncoder().encode(body);
  return { name, arrayBuffer: async () => bytes.buffer as ArrayBuffer };
}

const HEADER = BULK_COLUMNS.join(",");

describe("splitCsvLine", () => {
  it("keeps commas that sit inside quoted fields", () => {
    expect(splitCsvLine(`Acme,"12 Mill Road, Kolkata",9876500011`)).toEqual([
      "Acme", "12 Mill Road, Kolkata", "9876500011",
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitCsvLine(`"He said ""hi""",x`)).toEqual([`He said "hi"`, "x"]);
  });
});

describe("parseBulkLeadFile", () => {
  it("parses a good row and maps service names", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`${HEADER}\nAcme Ltd,9876500011,WEBSITE_ENQUIRY,Bulk SMS; SEO Services,,,,,,,,,,,,,180000,ONE_TIME,HIGH,note`),
      SERVICES,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      companyName: "Acme Ltd",
      phone: "9876500011",
      leadSource: "WEBSITE_ENQUIRY",
      serviceNames: ["Bulk SMS", "SEO Services"],
      estimatedBudget: 180000,
      budgetType: "ONE_TIME",
      priority: "HIGH",
    });
  });

  it("imports the good rows and reports the bad ones with row numbers", async () => {
    const r = await parseBulkLeadFile(
      csvFile(
        `${HEADER}\n` +
          `Good Co,9000000001,WEBSITE_ENQUIRY,Bulk SMS\n` +
          `,9000000002,WEBSITE_ENQUIRY,Bulk SMS\n` +          // no company
          `No Phone Co,,WEBSITE_ENQUIRY,Bulk SMS\n` +          // no phone
          `Bad Service Co,9000000004,WEBSITE_ENQUIRY,Nope\n` + // unknown service
          `Also Good,9000000005,GOOGLE_ADS,SEO Services`,
      ),
      SERVICES,
    );
    expect(r.rows.map((x) => x.companyName)).toEqual(["Good Co", "Also Good"]);
    // Row numbers match what the spreadsheet shows (header is row 1).
    expect(r.errors.map((e) => e.row)).toEqual([3, 4, 5]);
    expect(r.errors[2].reason).toMatch(/unknown service "Nope"/i);
  });

  it("rejects letters/short numbers in Phone but accepts +91 formatting", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`${HEADER}\nLetters Co,90000abc01,OTHER,Bulk SMS\nShort Co,12345,OTHER,Bulk SMS\nFormatted Co,+91 98765-43210,OTHER,Bulk SMS`),
      SERVICES,
    );
    expect(r.rows.map((x) => [x.companyName, x.phone])).toEqual([["Formatted Co", "919876543210"]]);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it("rejects an unknown lead source rather than silently defaulting it", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`${HEADER}\nAcme,9000000001,TELEPATHY,Bulk SMS`),
      SERVICES,
    );
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].reason).toMatch(/unknown lead source/i);
  });

  it("catches a phone repeated within the same file", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`${HEADER}\nA Co,9000000001,WEBSITE_ENQUIRY,Bulk SMS\nB Co,9000000001,WEBSITE_ENQUIRY,Bulk SMS`),
      SERVICES,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.errors[0].reason).toMatch(/duplicate phone/i);
  });

  it("accepts reordered and extra columns by matching on header names", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`Phone,Something Else,Company name,Services,Lead source\n9000000009,junk,Reordered Co,Bulk SMS,REFERRAL`),
      SERVICES,
    );
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ companyName: "Reordered Co", phone: "9000000009", leadSource: "REFERRAL" });
  });

  it("strips currency formatting from the budget", async () => {
    const r = await parseBulkLeadFile(
      csvFile(`Company name,Phone,Lead source,Services,Estimated budget\nAcme,9000000001,OTHER,Bulk SMS,"₹1,80,000"`),
      SERVICES,
    );
    expect(r.rows[0].estimatedBudget).toBe(180000);
  });

  it("explains itself when the header is missing", async () => {
    const r = await parseBulkLeadFile(csvFile(`just,some,junk\n1,2,3`), SERVICES);
    expect(r.rows).toHaveLength(0);
    expect(r.errors[0].reason).toMatch(/must include/i);
  });

  it("reports an empty file instead of throwing", async () => {
    const r = await parseBulkLeadFile(csvFile(""), SERVICES);
    expect(r.errors[0].reason).toMatch(/empty/i);
  });

  it("renders a downloadable error report", () => {
    const csv = errorsToCsv([{ row: 3, company: 'Weird "Co"', reason: "Phone is required." }]);
    expect(csv.split("\n")[0]).toBe("Row,Company,Reason");
    expect(csv).toContain('"Weird ""Co"""');
  });
});
