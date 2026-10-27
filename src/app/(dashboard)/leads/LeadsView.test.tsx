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

  it("submits the extended contact-detail fields, defaulting country to India", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/duplicates")) return new Response(JSON.stringify({ duplicates: [] }));
      if (String(url).includes("/api/services")) return new Response(JSON.stringify({ services: [{ id: 7, name: "Web Development" }] }));
      return new Response(JSON.stringify({ id: 2 }), { status: 201 });
    });
    render(<LeadsView initialLeads={sampleLeads} viewerRole="PRE_SALES" />);
    fireEvent.click(screen.getByRole("button", { name: /new lead/i }));
    fireEvent.change(screen.getByLabelText(/industry type/i), { target: { value: "Manufacturing" } });
    fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: "Retail" } });
    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "New Co" } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: "12 MG Road" } });
    fireEvent.change(screen.getByLabelText(/^state$/i), { target: { value: "Karnataka" } });
    fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: "560001" } });
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "9876543210" } });
    fireEvent.click(await screen.findByLabelText(/service interested/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /web development/i }));
    fireEvent.change(screen.getByLabelText(/^remarks$/i), { target: { value: "Call after 5pm" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/leads", expect.objectContaining({ method: "POST" })));
    const call = fetchSpy.mock.calls.find(([url, init]) => url === "/api/leads" && (init as RequestInit)?.method === "POST");
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      industry: "Manufacturing",
      businessType: "Retail",
      companyName: "New Co",
      address: "12 MG Road",
      state: "Karnataka",
      pincode: "560001",
      country: "India",
      whatsappNumber: "9876543210",
      serviceIds: [7],
      remarks: "Call after 5pm",
    });
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

  it("drops a selected lead from the bulk-transfer selection once a refetch no longer returns it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/api/users")) return new Response(JSON.stringify({ users: [] }));
      // Simulate a filter change: the refetch comes back without the lead that was selected.
      return new Response(JSON.stringify({ leads: [] }));
    });
    render(<LeadsView initialLeads={sampleLeads} viewerRole="MARKETING_HEAD" />);

    fireEvent.click(screen.getByLabelText(/select sample co/i));
    expect(screen.getByRole("button", { name: /transfer selected \(1\)/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /transfer selected/i })).not.toBeInTheDocument());
  });
});
