// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditLeadForm from "./EditLeadForm";
import type { LeadRow } from "@/lib/leads/types";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const lead: LeadRow = {
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
  pre_sales_owner_id: 2,
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
  created_by: 2,
  created_at: "2026-01-01T00:00:00Z" as unknown as Date,
  updated_at: "2026-01-01T00:00:00Z" as unknown as Date,
};

describe("EditLeadForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    refresh.mockClear();
  });

  it("submits the extended contact-detail fields as a PATCH, then navigates back to the lead", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ ok: true })));
    const existingService = { id: 7, name: "Web Development", description: null, status: "ACTIVE" as const, created_at: new Date(), updated_at: new Date() };
    render(<EditLeadForm lead={lead} serviceOptions={[existingService]} initialServiceIds={[7]} />);

    fireEvent.change(screen.getByLabelText(/industry type/i), { target: { value: "Manufacturing" } });
    fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: "Wholesale" } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: "Plot 9" } });
    fireEvent.click(screen.getByLabelText(/^state$/i));
    fireEvent.click(screen.getByRole("option", { name: "Gujarat" }));
    fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: "380001" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "9000000000" } });
    fireEvent.change(screen.getByLabelText(/estimated budget/i), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText(/^remarks$/i), { target: { value: "Call before visiting" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(`/api/leads/${lead.id}`, expect.objectContaining({ method: "PATCH" })));
    const call = fetchSpy.mock.calls.find(([url, init]) => url === `/api/leads/${lead.id}` && (init as RequestInit)?.method === "PATCH");
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      industry: "Manufacturing",
      businessType: "Wholesale",
      address: "Plot 9",
      state: "Gujarat",
      pincode: "380001",
      whatsappNumber: "9000000000",
      estimatedBudget: 50000,
      remarks: "Call before visiting",
      serviceIds: [7],
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/leads/${lead.id}`));
  });

  it("navigates back to the lead on cancel", () => {
    render(<EditLeadForm lead={lead} serviceOptions={[]} initialServiceIds={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(push).toHaveBeenCalledWith(`/leads/${lead.id}`);
  });
});
