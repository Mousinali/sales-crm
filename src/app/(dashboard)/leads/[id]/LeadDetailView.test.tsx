// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
  business_type: null,
  location: null,
  address: null,
  state: null,
  pincode: null,
  country: "India",
  gst_number: null,
  service_requirements: "CRM",
  estimated_budget: null,
  budget_type: null,
  lead_source: "OTHER",
  priority: "MEDIUM",
  status: "PENDING_REVIEW",
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
  created_by: 10,
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

  it("shows the status control to the lead's owner, whatever their role", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    expect(screen.getByRole("combobox", { name: /change status/i })).toBeInTheDocument();
  });

  it("shows the status control to a viewer the lead was shared with, but not the owner-only Edit link", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.getByRole("combobox", { name: /change status/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it("requires a reason before marking a lead lost", async () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    // CustomSelect is a button + listbox, not a native <select>, so the value
    // is chosen by opening it and clicking the option.
    fireEvent.click(screen.getByRole("combobox", { name: /change status/i }));
    fireEvent.click(screen.getByRole("option", { name: /closed.*lost/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
  });

  it("shows the assignment panel for the lead's owner, loading the roster", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ users: [], visits: [] }))));
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("tab", { name: /assignment/i }));
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));
    expect(screen.getByLabelText(/pre-sales owner/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/users/roster");
  });

  it("hides the assignment tab for a viewer who doesn't own the lead", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.queryByRole("tab", { name: /assignment/i })).not.toBeInTheDocument();
  });

  it("shows a Transfer button for Marketing Head and requires a reason", async () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("button", { name: /transfer/i }));
    const transferButtons = screen.getAllByRole("button", { name: /^transfer$/i });
    fireEvent.click(transferButtons[transferButtons.length - 1]);
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
  });

  it("hides the Transfer button for a viewer who doesn't own the lead", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="PRE_SALES" viewerId={preSalesId} />);
    expect(screen.queryByRole("button", { name: /transfer/i })).not.toBeInTheDocument();
  });

  it("lists the lead's fetched visits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/visits")) return Promise.resolve(new Response(JSON.stringify({ visits: [sampleVisit] })));
      return Promise.resolve(new Response(JSON.stringify({ users: [] })));
    });
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("tab", { name: /visits/i }));
    expect(await screen.findByText("Demo")).toBeInTheDocument();
  });

  it("shows a 'Schedule anyway' option on a 409 conflict, and succeeds once confirmed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes("/api/users/roster")) return Promise.resolve(new Response(JSON.stringify({ users: [{ id: salespersonId, name: "Sam Salesperson", role: "SALESPERSON" }] })));
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
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    fireEvent.click(screen.getByRole("tab", { name: /visits/i }));
    fireEvent.click(screen.getByRole("button", { name: /schedule visit/i }));

    // CustomSelect renders a button that opens a listbox, so the roster is
    // picked by opening it and clicking the option rather than setting a value.
    const visitSalespersonSelect = document.querySelector("#visitSalesperson") as HTMLElement;
    fireEvent.click(visitSalespersonSelect);
    fireEvent.click(await screen.findByRole("option", { name: "Sam Salesperson" }));
    fireEvent.click(screen.getByLabelText(/^date$/i));
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    fireEvent.click(screen.getByRole("button", { name: /December 1st, 2026/i }));
    fireEvent.click(screen.getByLabelText(/^time$/i));
    fireEvent.click(within(screen.getByRole("listbox", { name: "Hour" })).getByRole("button", { name: "10" }));
    fireEvent.change(screen.getByLabelText(/objective/i), { target: { value: "Demo" } });
    const scheduleButtons = screen.getAllByRole("button", { name: /^schedule visit$/i });
    fireEvent.click(scheduleButtons[scheduleButtons.length - 1]);

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
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="SALESPERSON" viewerId={salespersonId} />);
    fireEvent.click(screen.getByRole("tab", { name: /visits/i }));

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

  it("links Edit to the dedicated edit page instead of opening a modal", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="MARKETING_HEAD" viewerId={mhId} />);
    expect(screen.getByRole("link", { name: /^edit$/i })).toHaveAttribute("href", `/leads/${pendingLead.id}/edit`);
  });

  it("hides the Edit link for a viewer who cannot edit the lead", () => {
    render(<LeadDetailView lead={pendingLead} activities={[]} services={[]} viewerRole="SALESPERSON" viewerId={salespersonId} />);
    expect(screen.queryByRole("link", { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it("shows who created the lead, and copies the email to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <LeadDetailView
        lead={{ ...pendingLead, created_by_name: "Mimi Roy" }}
        activities={[]}
        services={[]}
        viewerRole="MARKETING_HEAD"
        viewerId={mhId}
      />,
    );

    expect(screen.getByText("Created by")).toBeInTheDocument();
    expect(screen.getByText("Mimi Roy")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /copy email/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(pendingLead.email));
  });

  it("links the WhatsApp number to a wa.me chat with digits only", () => {
    render(
      <LeadDetailView
        lead={{ ...pendingLead, whatsapp_number: "+91 98765-43210" }}
        activities={[]}
        services={[]}
        viewerRole="MARKETING_HEAD"
        viewerId={mhId}
      />,
    );
    expect(screen.getByRole("link", { name: /open in whatsapp/i })).toHaveAttribute("href", "https://wa.me/919876543210");
  });
});
