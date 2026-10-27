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
    expect(screen.getByText("Bulk SMS")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("creates a new service", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 2, name: "App Development", description: null, status: "ACTIVE" }), { status: 201 }),
    );
    render(<ServicesView initialServices={sampleServices} />);
    fireEvent.click(screen.getByRole("button", { name: /new service/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "App Development" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(await screen.findByText("App Development")).toBeInTheDocument();
  });

  it("edits a service's status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "Bulk SMS", description: "Reach thousands in seconds", status: "INACTIVE" })),
    );
    render(<ServicesView initialServices={sampleServices} />);
    fireEvent.click(screen.getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: "INACTIVE" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText("Inactive")).toBeInTheDocument());
  });
});
