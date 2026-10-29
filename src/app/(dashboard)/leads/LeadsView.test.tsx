// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeadsView from "./LeadsView";
import type { LeadRow } from "@/lib/leads/types";

const sampleLeads: LeadRow[] = [
  {
    id: 1,
    company_name: "Sample Co",
    company_name_normalized: "sampleco",
    contact_person: "Jane Doe",
    designation: null,
    phone: "123",
    phone_normalized: "123",
    email: "jane@example.com",
    website: null,
    website_domain: null,
    industry: null,
    business_type: null,
    location: null,
    address: null,
    state: null,
    pincode: null,
    country: "India",
    service_requirements: "CRM",
    estimated_budget: null,
    lead_source: "OTHER",
    priority: "MEDIUM",
    status: "PENDING_REVIEW",
    status_reason: null,
    pre_sales_owner_id: 2,
    salesperson_owner_id: null,
    next_follow_up_at: null,
    notes: null,
    whatsapp_number: null,
    remarks: null,
    archived_at: null,
    created_by: 2,
    created_at: "2026-01-01T00:00:00Z" as unknown as Date,
    updated_at: "2026-01-01T00:00:00Z" as unknown as Date,
  },
];

describe("LeadsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial lead list", () => {
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="PRE_SALES" />);
    expect(screen.getByText("Sample Co")).toBeInTheDocument();
  });

  it("links New Lead to the dedicated /leads/new page instead of opening a modal", () => {
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="PRE_SALES" />);
    expect(screen.getByRole("link", { name: /new lead/i })).toHaveAttribute("href", "/leads/new");
  });

  it("allows row selection for export but hides bulk transfer for a non-Marketing-Head viewer", () => {
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="PRE_SALES" />);
    expect(screen.getByLabelText(/select sample co/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/select sample co/i));
    expect(screen.queryByText(/transfer selected/i)).not.toBeInTheDocument();
  });

  it("builds an export link with the selected lead ids and chosen format", () => {
    const clickedUrls: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedUrls.push(this.href);
    });
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="PRE_SALES" />);
    fireEvent.click(screen.getByLabelText(/select sample co/i));
    fireEvent.click(screen.getByRole("button", { name: /export excel/i }));
    expect(clickedUrls).toHaveLength(1);
    expect(clickedUrls[0]).toContain("/api/leads/export?");
    expect(clickedUrls[0]).toContain("ids=1");
    expect(clickedUrls[0]).toContain("format=xlsx");
  });

  it("lets a Marketing Head select leads and bulk-transfer them with a confirmation step", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("role=SALESPERSON")) return new Response(JSON.stringify({ users: [{ id: 9, name: "Sam Salesperson" }] }));
      if (String(url).includes("/api/users")) return new Response(JSON.stringify({ users: [] }));
      if (String(url).includes("/transfer-bulk")) return new Response(JSON.stringify({ leads: [] }));
      return new Response(JSON.stringify({ leads: sampleLeads }));
    });
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="MARKETING_HEAD" />);

    fireEvent.click(screen.getByLabelText(/select sample co/i));
    fireEvent.click(screen.getByRole("button", { name: /transfer selected/i }));

    await screen.findByText("Sam Salesperson");
    fireEvent.change(screen.getByLabelText(/new salesperson/i), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/reason/i), { target: { value: "Realignment" } });
    fireEvent.click(screen.getByRole("button", { name: /review transfer/i }));
    expect(await screen.findByText(/are you sure/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /yes, transfer/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/leads/transfer-bulk", expect.objectContaining({ method: "POST" })),
    );
  });

  it("drops a selected lead from the bulk-transfer selection once a refetch no longer returns it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/api/users")) return new Response(JSON.stringify({ users: [] }));
      // Simulate a filter change: the refetch comes back without the lead that was selected.
      return new Response(JSON.stringify({ leads: [] }));
    });
    render(<LeadsView initialLeads={sampleLeads} initialTotal={sampleLeads.length} initialTotalPages={1} viewerRole="MARKETING_HEAD" />);

    fireEvent.click(screen.getByLabelText(/select sample co/i));
    expect(screen.getByRole("button", { name: /transfer selected \(1\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /transfer selected/i })).not.toBeInTheDocument());
  });
});
