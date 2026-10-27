// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeadDetailView from "./LeadDetailView";
import type { LeadRow } from "@/lib/leads/types";
import type { VisitRow } from "@/lib/visits/types";

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
const salespersonId = 20;

const sampleVisit: VisitRow = {
  id: 5,
  lead_id: 1,
  salesperson_id: salespersonId,
  visit_date: "2026-12-01",
  start_time: "10:00:00",
  expected_duration_minutes: null,
  location: null,
  objective: "Demo",
  preparation_notes: null,
  status: "SCHEDULED",
  outcome_notes: null,
  next_action: null,
  created_by: mhId,
  created_at: "2026-01-01T00:00:00Z" as unknown as Date,
  updated_at: "2026-01-01T00:00:00Z" as unknown as Date,
};

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

  it("lists the lead's fetched visits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/visits")) return Promise.resolve(new Response(JSON.stringify({ visits: [sampleVisit] })));
      return Promise.resolve(new Response(JSON.stringify({ users: [] })));
    });
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    expect(await screen.findByText("Demo")).toBeInTheDocument();
  });

  it("shows a 'Schedule anyway' option on a 409 conflict, and succeeds once confirmed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("role=SALESPERSON")) return Promise.resolve(new Response(JSON.stringify({ users: [{ id: salespersonId, name: "Sam Salesperson" }] })));
      if (url.includes("/visits") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(
          body.confirmConflict
            ? new Response(JSON.stringify({ ...sampleVisit }))
            : new Response(JSON.stringify({ error: "conflict" }), { status: 409 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ users: [], visits: [] })));
    });
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);

    const visitSalespersonSelect = screen.getByLabelText(/salesperson/i, { selector: "#visitSalesperson" });
    await waitFor(() => expect(screen.getByText("Sam Salesperson", { selector: "#visitSalesperson option" })).toBeInTheDocument());
    fireEvent.change(visitSalespersonSelect, { target: { value: String(salespersonId) } });
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: "2026-12-01" } });
    fireEvent.change(screen.getByLabelText(/^time$/i), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText(/objective/i), { target: { value: "Demo" } });
    fireEvent.click(screen.getByRole("button", { name: /schedule visit/i }));

    const scheduleAnyway = await screen.findByRole("button", { name: /schedule anyway/i });
    fireEvent.click(scheduleAnyway);

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/leads/1/visits",
        expect.objectContaining({ body: expect.stringContaining('"confirmConflict":true') }),
      ),
    );
  });

  it("lets the assigned Salesperson open the outcome form and record a Completed outcome", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/visits")) return Promise.resolve(new Response(JSON.stringify({ visits: [sampleVisit] })));
      return Promise.resolve(new Response(JSON.stringify({ users: [] })));
    });
    render(<LeadDetailView lead={pendingLead} activities={[]} viewerRole="SALESPERSON" viewerId={salespersonId} />);

    fireEvent.click(await screen.findByRole("button", { name: /record outcome/i }));
    fireEvent.change(screen.getByLabelText(/outcome notes/i), { target: { value: "Went well" } });
    fireEvent.click(screen.getByRole("button", { name: /mark completed/i }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/visits/5",
        expect.objectContaining({ method: "PATCH", body: expect.stringContaining('"outcome":"COMPLETED"') }),
      ),
    );
  });
});
