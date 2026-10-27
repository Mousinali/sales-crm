// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import LeadDetailView from "./LeadDetailView";
import type { LeadRow } from "@/lib/leads/types";

const pendingLead: LeadRow = {
  id: 1,
  company_name: "Detail Co",
  company_name_normalized: "detailco",
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
};

const mhId = 10;
const preSalesId = 2;

describe("LeadDetailView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // A fresh Response per call: Response bodies can only be read once, and
    // this component now fires several concurrent fetches (users x2, visits).
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ users: [], visits: [] }))),
    );
  });

  it("shows qualify/reject/return actions only for Marketing Head on a Pending Review lead", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    expect(screen.getByRole("button", { name: /qualify/i })).toBeInTheDocument();
  });

  it("hides review actions for a Pre-sales viewer", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.queryByRole("button", { name: /qualify/i })).not.toBeInTheDocument();
  });

  it("requires a reason before submitting a reject", async () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
  });

  it("shows the assignment panel for Marketing Head even on a Pending Review lead, fetching only active users", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ users: [], visits: [] }))));
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    expect(screen.getByLabelText(/pre-sales owner/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("role=PRE_SALES"));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/role=PRE_SALES.*status=ACTIVE|status=ACTIVE.*role=PRE_SALES/));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/role=SALESPERSON.*status=ACTIVE|status=ACTIVE.*role=SALESPERSON/));
  });

  it("hides the assignment panel for a non-Marketing-Head viewer", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.queryByLabelText(/pre-sales owner/i)).not.toBeInTheDocument();
  });

  it("shows a Transfer button for Marketing Head and requires a reason", async () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("button", { name: /transfer/i }));
    const transferButtons = screen.getAllByRole("button", { name: /^transfer$/i });
    fireEvent.click(transferButtons[transferButtons.length - 1]);
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
  });

  it("hides the Transfer button for a non-Marketing-Head viewer", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.queryByRole("button", { name: /transfer/i })).not.toBeInTheDocument();
  });
});
