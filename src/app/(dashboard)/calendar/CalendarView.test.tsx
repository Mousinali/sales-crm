// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CalendarView from "./CalendarView";

describe("CalendarView invite picker", () => {
  it("filters the already-loaded roster client-side as you type, without re-querying the server under 3 characters", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          users: [
            { id: 2, name: "Bikash", role: "SALESPERSON" },
            { id: 3, name: "Mimi Roy", role: "MARKETING_HEAD" },
          ],
        }),
        { status: 200 },
      ),
    );
    render(<CalendarView initialEvents={[]} viewerId={1} />);

    fireEvent.click(screen.getByRole("button", { name: /new event/i }));
    await screen.findByText("Bikash");
    expect(screen.getByText("Mimi Roy")).toBeInTheDocument();

    const initialCallCount = fetchSpy.mock.calls.length;
    fireEvent.change(screen.getByPlaceholderText(/search people by name/i), { target: { value: "bi" } });

    // Under 3 characters: the visible list narrows immediately (client-side),
    // but no new request should follow even after the debounce window.
    expect(screen.getByText("Bikash")).toBeInTheDocument();
    expect(screen.queryByText("Mimi Roy")).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(fetchSpy.mock.calls.length).toBe(initialCallCount);

    fireEvent.change(screen.getByPlaceholderText(/search people by name/i), { target: { value: "bik" } });
    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCallCount));
    expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining("q=bik"));
  });
});

describe("CalendarView month grid", () => {
  it("renders a full grid of weekday columns and lets you click a day to open the new-event form with that date prefilled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ users: [] }), { status: 200 }));
    render(<CalendarView initialEvents={[]} viewerId={1} />);

    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();

    const today = new Date();
    fireEvent.click(screen.getByTestId("today-cell"));

    const startsAtInput = await screen.findByLabelText(/date & time/i);
    expect((startsAtInput as HTMLInputElement).value).toContain(
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
    );
  });
});
