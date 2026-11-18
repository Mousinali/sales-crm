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
  lead_id: null,
  created_by: 7,
};

describe("TasksView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the initial task list", () => {
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={42} />);
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
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={42} />);
    fireEvent.click(screen.getByRole("button", { name: /^complete$/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/1", expect.objectContaining({ method: "PATCH" })),
    );
    await waitFor(() => expect(screen.getAllByText("Completed").length).toBeGreaterThan(0));
  });

  it("opens the task's details on row click and saves edits with a PATCH", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      Promise.resolve(new Response(JSON.stringify(init?.method === "PATCH" ? sampleTask : { tasks: [sampleTask], leads: [], users: [], total: 1, totalPages: 1 }))),
    );
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={42} />);
    fireEvent.click(screen.getByText("Follow up"));
    expect(screen.getByRole("heading", { name: /task details/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/1", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Renamed") })),
    );
  });

  it("shows details read-only for a task not assigned to the viewer", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ users: [], leads: [] })));
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={99} />);
    fireEvent.click(screen.getByText("Follow up"));
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toBeDisabled();
  });

  it("hides inline status actions for a task not assigned to the viewer", () => {
    render(<TasksView initialTasks={[sampleTask]} initialTotal={1} initialTotalPages={1} viewerId={99} />);
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
    render(<TasksView initialTasks={[]} initialTotal={0} initialTotalPages={1} viewerId={42} />);
    fireEvent.click(screen.getByRole("button", { name: /new task/i }));
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: "New one" } });
    fireEvent.click(screen.getByLabelText(/due/i, { selector: "#taskDueAt" }));
    fireEvent.click(screen.getByRole("button", { name: /next month/i }));
    fireEvent.click(screen.getByRole("button", { name: /December 1st, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByText("New one")).toBeInTheDocument();
  });
});
