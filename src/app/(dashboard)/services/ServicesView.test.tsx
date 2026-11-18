// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ServicesView from "./ServicesView";
import type { ServiceRow } from "@/lib/services/types";

const sampleServices: ServiceRow[] = [
  {
    id: 1,
    name: "Bulk SMS",
    description: "Reach thousands in seconds",
    status: "ACTIVE",
    created_at: new Date(),
    updated_at: new Date(),
  },
];

describe("ServicesView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial service list", () => {
    render(<ServicesView initialServices={sampleServices} />);
    expect(screen.getAllByText("Bulk SMS").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("switch", { name: /deactivate service/i }).length).toBeGreaterThan(0);
  });

  it("debounces the search: the box updates at once, the list only after a pause", async () => {
    render(<ServicesView initialServices={sampleServices} />);
    const box = screen.getByLabelText(/search services/i) as HTMLInputElement;

    fireEvent.change(box, { target: { value: "zzz" } });
    // The typed text appears immediately while the row is still listed — that
    // gap is the debounce; without it the table re-filters on every keystroke.
    expect(box.value).toBe("zzz");
    expect(screen.getAllByText("Bulk SMS").length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.queryAllByText("Bulk SMS")).toHaveLength(0));
    expect(screen.getAllByText(/no services match your search/i).length).toBeGreaterThan(0);
  });

  it("creates a new service", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 2, name: "App Development", description: null, status: "ACTIVE" }), { status: 201 }),
    );
    render(<ServicesView initialServices={sampleServices} />);
    fireEvent.click(screen.getByRole("button", { name: /new service/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "App Development" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect((await screen.findAllByText("App Development")).length).toBeGreaterThan(0);
  });

  it("toggles a service's status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "Bulk SMS", description: "Reach thousands in seconds", status: "INACTIVE" })),
    );
    render(<ServicesView initialServices={sampleServices} />);
    // The phone cards and the table each render a switch; either toggles the same service.
    fireEvent.click(screen.getAllByRole("switch", { name: /deactivate service/i })[0]);
    await waitFor(() => expect(screen.getAllByRole("switch", { name: /^activate service/i }).length).toBeGreaterThan(0));
  });
});
