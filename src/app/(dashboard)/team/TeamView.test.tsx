// src/app/(dashboard)/team/TeamView.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TeamView from "./TeamView";
import type { UserRow } from "@/lib/users/types";

const sampleUsers: UserRow[] = [
  { id: 1, role: "PRE_SALES", name: "Alice", email: "alice@example.com", status: "ACTIVE", employee_id: null, phone: null, whatsapp_number: null, designation: null, avatar_url: null, archived_at: null, created_by: 2, created_at: "2026-01-01T00:00:00Z" as unknown as Date, updated_at: "2026-01-01T00:00:00Z" as unknown as Date },
];

describe("TeamView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial user list", () => {
    render(<TeamView initialUsers={sampleUsers} initialTotal={1} initialTotalPages={1} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("shows a one-time temp password panel after creating a user", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      Promise.resolve(
        init?.method === "POST"
          ? new Response(JSON.stringify({ id: 2, email: "new@example.com", tempPassword: "abc123XYZ789" }), { status: 201 })
          : new Response(JSON.stringify({ users: sampleUsers, total: 1, totalPages: 1 })),
      ),
    );

    render(<TeamView initialUsers={sampleUsers} initialTotal={1} initialTotalPages={1} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);

    fireEvent.click(screen.getByRole("button", { name: /new user/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "New Person" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    expect(await screen.findByText(/abc123XYZ789/)).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });

  it("requires confirmation before deactivating a user", async () => {
    render(<TeamView initialUsers={sampleUsers} initialTotal={1} initialTotalPages={1} viewerRole="MARKETING_HEAD" creatableRoles={["PRE_SALES", "SALESPERSON"]} />);

    fireEvent.click(screen.getByRole("button", { name: /deactivate/i }));
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
  });
});
