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
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={42} viewerRole="SALESPERSON" />);
    expect(screen.getByText("Follow up")).toBeInTheDocument();
  });

  it("lets the assigned user complete their task inline", async () => {
    const completedTask = { ...sampleTask, status: "COMPLETED" as const };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      Promise.resolve(
        new Response(
          init?.method === "PATCH"
            ? JSON.stringify(completedTask)
            : JSON.stringify({ tasks: [completedTask], total: 1, totalPages: 1 }),
        ),
      ),
    );
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={42} viewerRole="SALESPERSON" />);
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/1", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(screen.getAllByText("Completed").length).toBeGreaterThan(0));
  });

  it("hides inline status actions for a task not assigned to the viewer", () => {
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={99} viewerRole="SALESPERSON" />);
    expect(screen.queryByRole("button", { name: /^complete$/i })).not.toBeInTheDocument();
  });

  it("creates a new task assigned to self", async () => {
    const newTask = { ...sampleTask, id: 2, title: "New one" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      Promise.resolve(
        init?.method === "POST"
          ? new Response(JSON.stringify(newTask), { status: 201 })
          : new Response(JSON.stringify({ tasks: [newTask], total: 1, totalPages: 1 })),
      ),
    );
    render(<TasksView initialTasks={[]} initialTotal={0} initialTotalPages={1} viewerId={42} viewerRole="SALESPERSON" />);
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "New one" } });
    fireEvent.change(screen.getByLabelText(/due/i, { selector: "#taskDueAt" }), { target: { value: "2026-12-01T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("New one")).toBeInTheDocument();
  });
});
