// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationsBell from "./NotificationsBell";

describe("NotificationsBell", () => {
  it("shows an unread count and marks a notification read on click", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/notifications")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              notifications: [{ id: 1, type: "LEAD_ASSIGNED", message: "You were assigned Acme Corp", read_at: null }],
            }),
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });

    render(<NotificationsBell />);
    expect(await screen.findByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByText("You were assigned Acme Corp"));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/notifications/1", expect.objectContaining({ method: "PATCH" })),
    );
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
