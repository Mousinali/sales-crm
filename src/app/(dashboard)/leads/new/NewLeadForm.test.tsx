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
    const next = () => fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    // Step 1 — Company
    fireEvent.click(screen.getByLabelText(/industry type/i));
    fireEvent.click(screen.getByRole("option", { name: "Engineering & Manufacturing" }));
    fireEvent.change(screen.getByLabelText(/business type/i), { target: { value: "Retail" } });
    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "New Co" } });
    next();

    // Step 2 — Address
    fireEvent.change(screen.getByLabelText(/^address$/i), { target: { value: "12 MG Road" } });
    fireEvent.click(screen.getByLabelText(/^state$/i));
    fireEvent.click(screen.getByRole("option", { name: "Karnataka" }));
    fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: "560001" } });
    next();

    // Step 3 — Contact
    fireEvent.change(screen.getByLabelText(/^phone$/i), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "9876543210" } });
    next();

    // Step 4 — Opportunity, where Create replaces Next
    fireEvent.click(screen.getByLabelText(/service interested/i));
    fireEvent.click(screen.getByRole("checkbox", { name: /web development/i }));
    fireEvent.change(screen.getByLabelText(/^remarks$/i), { target: { value: "Call after 5pm" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/leads", expect.objectContaining({ method: "POST" })));
    const call = fetchSpy.mock.calls.find(([url, init]) => url === "/api/leads" && (init as RequestInit)?.method === "POST");
    const body = JSON.parse((call?.[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      industry: "Engineering & Manufacturing",
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

  it("will not leave step 1 without a company name", () => {
    render(<NewLeadForm serviceOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/enter a company name/i);
    // Still on step 1: the address field belongs to step 2.
    expect(screen.queryByLabelText(/^address$/i)).toBeNull();
  });

  it("stops on the step whose required field is missing, instead of at the end", () => {
    render(<NewLeadForm serviceOptions={[]} />);
    const next = () => fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "No Phone Ltd" } });
    next(); // Company -> Address
    next(); // Address -> Contact
    next(); // blocked here: phone is required and empty

    expect(screen.getByRole("alert")).toHaveTextContent(/enter a phone number/i);
    // Still on Contact, with the offending field on screen — rather than being
    // told about it four steps later when it isn't even rendered.
    expect(screen.getByLabelText(/^phone$/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^create$/i })).toBeNull();
  });

  it("keeps what was typed when stepping back", () => {
    render(<NewLeadForm serviceOptions={[]} />);
    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "Keep Me Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.change(screen.getByLabelText(/pincode/i), { target: { value: "700001" } });

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect((screen.getByLabelText(/^company$/i) as HTMLInputElement).value).toBe("Keep Me Ltd");

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect((screen.getByLabelText(/pincode/i) as HTMLInputElement).value).toBe("700001");
  });

  it("navigates back to /leads on cancel", () => {
    render(<NewLeadForm serviceOptions={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(push).toHaveBeenCalledWith("/leads");
  });
});
