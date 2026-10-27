// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AnnouncementsView from "./AnnouncementsView";

describe("AnnouncementsView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("composes and sends an announcement to all active Salespeople", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/api/users")) return Promise.resolve(new Response(JSON.stringify({ users: [] })));
      return Promise.resolve(
        new Response(JSON.stringify({ id: 1, subject: "Q4 kickoff", body: "Join the call at 3pm", created_at: new Date().toISOString(), recipientStatusCounts: { SENT: 2 } }), { status: 201 }),
      );
    });
    render(<AnnouncementsView initialAnnouncements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /new announcement/i }));
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Q4 kickoff" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Join the call at 3pm" } });
    fireEvent.click(screen.getByRole("button", { name: /all salespeople/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
  });

  it("requires at least one recipient for a specific-users send", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ users: [] })));
    render(<AnnouncementsView initialAnnouncements={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /new announcement/i }));
    fireEvent.change(screen.getByLabelText(/subject/i), { target: { value: "Hi" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: /choose specific users/i }));
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
    expect(await screen.findByText(/select at least one recipient/i)).toBeInTheDocument();
  });

  it("shows a Retry failed button when a sent announcement has failures, and retries", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/retry")) return Promise.resolve(new Response(JSON.stringify({ retried: 1, stillFailed: 0 })));
      if (url.includes("/api/email-announcements")) return Promise.resolve(new Response(JSON.stringify({ announcements: [] })));
      return Promise.resolve(new Response(JSON.stringify({ users: [] })));
    });
    const announcement = { id: 5, subject: "Hi", body: "Hi", created_at: new Date().toISOString(), recipientStatusCounts: { SENT: 1, FAILED: 1 } };
    render(<AnnouncementsView initialAnnouncements={[announcement]} />);
    fireEvent.click(screen.getByRole("button", { name: /retry failed/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/email-announcements/5/retry", expect.objectContaining({ method: "POST" })));
  });
});
