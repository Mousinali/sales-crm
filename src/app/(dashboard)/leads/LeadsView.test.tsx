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
    location: null,
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
    render(<LeadsView initialLeads={sampleLeads} viewerRole="PRE_SALES" />);
    expect(screen.getByText("Sample Co")).toBeInTheDocument();
  });

  it("renders the initial lead list and opens the create modal with a duplicate warning", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/duplicates")) return new Response(JSON.stringify({ duplicates: [{ id: 1, companyName: "Acme Corp", status: "PENDING_REVIEW" }] }));
      return new Response(JSON.stringify({ id: 2 }), { status: 201 });
    });
    render(<LeadsView initialLeads={sampleLeads} viewerRole="PRE_SALES" />);
    fireEvent.click(screen.getByRole("button", { name: /new lead/i }));
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText(/company/i));
    expect(await screen.findByText(/similar lead/i)).toBeInTheDocument();
  });

  it("hides row selection and bulk transfer for a non-Marketing-Head viewer", () => {
    render(<LeadsView initialLeads={sampleLeads} viewerRole="PRE_SALES" />);
    expect(screen.queryByLabelText(/select sample co/i)).not.toBeInTheDocument();
  });

  it("lets a Marketing Head select leads and bulk-transfer them with a confirmation step", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("role=SALESPERSON")) return new Response(JSON.stringify({ users: [{ id: 9, name: "Sam Salesperson" }] }));
      if (String(url).includes("/api/users")) return new Response(JSON.stringify({ users: [] }));
      if (String(url).includes("/transfer-bulk")) return new Response(JSON.stringify({ leads: [] }));
      return new Response(JSON.stringify({ leads: sampleLeads }));
    });
    render(<LeadsView initialLeads={sampleLeads} viewerRole="MARKETING_HEAD" />);

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
});
