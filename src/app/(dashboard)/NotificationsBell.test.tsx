// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationsBell from "./NotificationsBell";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// A minimal fake socket: capture the "notification:new" handler so a test
// can fire it directly, standing in for a real server push.
let socketHandlers: Record<string, (payload: unknown) => void> = {};
vi.mock("socket.io-client", () => ({
  io: () => {
    socketHandlers = {};
    return {
      on: (event: string, handler: (payload: unknown) => void) => {
        socketHandlers[event] = handler;
      },
      disconnect: () => {},
    };
  },
}));

function mockNotificationsFetch(notification: Record<string, unknown>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/api/notifications")) {
      return Promise.resolve(new Response(JSON.stringify({ notifications: [notification] })));
    }
    return Promise.resolve(new Response(JSON.stringify({ ok: true })));
  });
}

describe("NotificationsBell", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an unread count, marks a notification read, and navigates to the lead it's about", async () => {
    const fetchSpy = mockNotificationsFetch({
      id: 1,
      type: "LEAD_ASSIGNED",
      message: "You were assigned Acme Corp",
      read_at: null,
      lead_id: 99,
      related_user_id: null,
    });

    render(<NotificationsBell />);
    expect(await screen.findByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByText("You were assigned Acme Corp"));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/notifications/1", expect.objectContaining({ method: "PATCH" })),
    );
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(push).toHaveBeenCalledWith("/leads/99");
  });

  it("navigates to the lead for a visit notification", async () => {
    push.mockClear();
    mockNotificationsFetch({
      id: 5,
      type: "VISIT_SCHEDULED",
      message: "A client visit was scheduled for you",
      read_at: null,
      lead_id: 7,
      related_user_id: null,
    });

    render(<NotificationsBell />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText("A client visit was scheduled for you"));

    expect(push).toHaveBeenCalledWith("/leads/7");
  });

  it("navigates to the calendar for a calendar-event notification", async () => {
    push.mockClear();
    mockNotificationsFetch({
      id: 6,
      type: "CALENDAR_EVENT",
      message: "You were invited to a meeting",
      read_at: null,
      lead_id: null,
      related_user_id: null,
    });

    render(<NotificationsBell />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText("You were invited to a meeting"));

    expect(push).toHaveBeenCalledWith("/calendar");
  });

  it("navigates to the sender's conversation when a chat notification is clicked", async () => {
    push.mockClear();
    mockNotificationsFetch({
      id: 2,
      type: "CHAT_MESSAGE",
      message: "Alice sent you a message",
      read_at: null,
      related_user_id: 42,
    });

    render(<NotificationsBell />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByText("Alice sent you a message"));

    expect(push).toHaveBeenCalledWith("/chat?with=42");
  });

  it("shows a notification pushed over the socket without waiting for a page reload", async () => {
    mockNotificationsFetch({
      id: 3,
      type: "LEAD_ASSIGNED",
      message: "Existing notification",
      read_at: "2026-01-01T00:00:00Z",
      related_user_id: null,
    });

    render(<NotificationsBell />);
    await screen.findByRole("button", { name: /notifications/i });
    expect(screen.queryByText("1")).not.toBeInTheDocument(); // the one existing notification is already read

    socketHandlers["notification:new"]?.({
      id: 4,
      type: "CHAT_MESSAGE",
      message: "Bob sent you a message",
      read_at: null,
      related_user_id: 7,
    });

    expect(await screen.findByText("1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByText("Bob sent you a message")).toBeInTheDocument();
  });

  it("deletes a notification without navigating, and removes it from the list", async () => {
    const fetchSpy = mockNotificationsFetch({
      id: 8,
      type: "LEAD_ASSIGNED",
      message: "Delete me",
      read_at: null,
      lead_id: 1,
      related_user_id: null,
    });

    render(<NotificationsBell />);
    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(await screen.findByLabelText(/delete notification/i));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/notifications/8", expect.objectContaining({ method: "DELETE" })),
    );
    expect(screen.queryByText("Delete me")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("hides the unread badge once muted, and persists the choice across remounts", async () => {
    mockNotificationsFetch({
      id: 9,
      type: "LEAD_ASSIGNED",
      message: "Still unread",
      read_at: null,
      lead_id: 1,
      related_user_id: null,
    });

    const { unmount } = render(<NotificationsBell />);
    expect(await screen.findByText("1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    fireEvent.click(screen.getByRole("button", { name: /^mute$/i }));
    expect(screen.queryByText("1")).not.toBeInTheDocument();

    unmount();
    render(<NotificationsBell />);
    await screen.findByRole("button", { name: /notifications/i });
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });
});
