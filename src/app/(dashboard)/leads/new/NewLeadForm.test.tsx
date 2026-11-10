// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NewLeadForm from "./NewLeadForm";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("NewLeadForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
  });

  it("shows a duplicate warning after blurring the company name", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/duplicates")) {
        return new Response(JSON.stringify({ duplicates: [{ id: 1, companyName: "Acme Corp", status: "PENDING_REVIEW" }] }));
      }
      return new Response(JSON.stringify({ id: 2 }), { status: 201 });
    });
    render(<NewLeadForm serviceOptions={[]} />);
    fireEvent.change(screen.getByLabelText(/company/i), { target: { value: "Acme Corp" } });
    fireEvent.blur(screen.getByLabelText(/company/i));
    expect(await screen.findByText(/similar lead/i)).toBeInTheDocument();
  });

  it("submits the extended contact-detail fields, defaulting country to India, then navigates to the new lead", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/duplicates")) return new Response(JSON.stringify({ duplicates: [] }));
      return new Response(JSON.stringify({ id: 2 }), { status: 201 });
    });
    render(<NewLeadForm serviceOptions={[{ id: 7, name: "Web Development", description: null, status: "ACTIVE", created_at: new Date(), updated_at: new Date() }]} />);
    fireEvent.change(screen.getByLabelText(/industry type/i), { target: { value: "Manufacturing" } });
    fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: "Retail" } });
    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "New Co" } });
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: "12 MG Road" } });
    fireEvent.click(screen.getByLabelText(/^state$/i));
    fireEvent.click(screen.getByRole("option", { name: "Karnataka" }));
    fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: "560001" } });
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "9876543210" } });
    fireEvent.click(screen.getByLabelText(/service interested/i));
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
    await waitFor(() => expect(push).toHaveBeenCalledWith("/leads/2"));
  });

  it("navigates back to /leads on cancel", () => {
    render(<NewLeadForm serviceOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(push).toHaveBeenCalledWith("/leads");
  });
});
