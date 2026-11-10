import { describe, it, expect } from "vitest";
import { leadsToCsv, type LeadExportRow } from "./export";

function makeLead(overrides: Partial<LeadExportRow>): LeadExportRow {
  return {
    id: 1,
    serviceNames: "",
    company_name: "Acme, Inc.",
    company_name_normalized: "acme inc",
    contact_person: null,
    designation: null,
    phone: "123",
    phone_normalized: "123",
    email: null,
    website: null,
    website_domain: null,
    industry: null,
    business_type: null,
    location: null,
    address: null,
    state: null,
    pincode: null,
    country: "India",
    service_requirements: "x",
    estimated_budget: null,
    budget_type: null,
    lead_source: "OTHER",
    priority: "LOW",
    status: "NEW",
    status_reason: null,
    pre_sales_owner_id: null,
    salesperson_owner_id: null,
    next_follow_up_at: null,
    notes: null,
    whatsapp_number: null,
    remarks: null,
    youtube_url: null,
    facebook_url: null,
    instagram_url: null,
    linkedin_url: null,
    archived_at: null,
    created_by: 1,
    created_at: new Date("2026-01-01T00:00:00.000Z"),
    updated_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("leadsToCsv", () => {
  it("quotes fields containing commas and escapes embedded quotes", () => {
    const csv = leadsToCsv([makeLead({ company_name: 'Acme, "The" Inc.' })]);
    const [, row] = csv.split("\r\n");
    expect(row.startsWith('"Acme, ""The"" Inc."')).toBe(true);
  });

  it("neutralizes formula-leading characters so Excel won't execute them", () => {
    const csv = leadsToCsv([makeLead({ company_name: "=cmd|'/c calc'!A1" })]);
    const [, row] = csv.split("\r\n");
    expect(row.startsWith("'=cmd")).toBe(true);
  });

  it("maps status and priority to their display labels", () => {
    const csv = leadsToCsv([makeLead({ status: "CLOSED_WON", priority: "HIGH" })]);
    expect(csv).toContain("Closed — won");
    expect(csv).toContain("High");
  });

  it("includes the address and the joined-in selected service names", () => {
    const csv = leadsToCsv([makeLead({ address: "123 Main St", serviceNames: "Bulk SMS, Whatsapp API" })]);
    expect(csv).toContain("123 Main St");
    expect(csv).toContain("Bulk SMS, Whatsapp API");
  });
});
