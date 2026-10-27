// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TasksView from "./TasksView";

const sampleTask = {
  id: 1,
  title: "Follow up",
  description: null,
  due_at: "2026-11-05T10:00:00Z",
  priority: "MEDIUM" as const,
  status: "PENDING" as const,
  assigned_user_id: 42,
};

describe("TasksView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial task list", () => {
    render(<TasksView initialTasks={[sampleTask]} viewerId={42} viewerRole="SALESPERSON" />);
    expect(screen.getByText("Follow up")).toBeInTheDocument();
  });

  it("lets the assigned user complete their task inline", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ...sampleTask, status: "COMPLETED" }))));
    render(<TasksView initialTasks={[sampleTask]} viewerId={42} viewerRole="SALESPERSON" />);
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/1", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(screen.getAllByText("Completed").length).toBeGreaterThan(0));
  });

  it("hides inline status actions for a task not assigned to the viewer", () => {
    render(<TasksView initialTasks={[sampleTask]} viewerId={99} viewerRole="SALESPERSON" />);
    expect(screen.queryByRole("button", { name: /^complete$/i })).not.toBeInTheDocument();
  });

  it("creates a new task assigned to self", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ...sampleTask, id: 2, title: "New one" }), { status: 201 }));
    render(<TasksView initialTasks={[]} viewerId={42} viewerRole="SALESPERSON" />);
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "New one" } });
    fireEvent.change(screen.getByLabelText(/due/i, { selector: "#taskDueAt" }), { target: { value: "2026-12-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("New one")).toBeInTheDocument();
  });
});
