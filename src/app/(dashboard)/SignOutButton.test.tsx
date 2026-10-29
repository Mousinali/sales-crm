// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SignOutButton from "./SignOutButton";

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("asks for confirmation before signing out, and does nothing on cancel", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    expect(screen.getByText(/sign out\?/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/sign out\?/i)).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("signs out only after the warning is confirmed", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null));
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    const confirmButtons = screen.getAllByRole("button", { name: /^sign out$/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" }));
  });
});
