// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiSelectSearch from "./MultiSelectSearch";

const options = [
  { id: 1, name: "Web Development" },
  { id: 2, name: "Bulk SMS", description: "Reach thousands in seconds" },
  { id: 3, name: "App Development" },
];

describe("MultiSelectSearch", () => {
  it("opens, filters by search, and selects an option", () => {
    const onChange = vi.fn();
    render(<MultiSelectSearch id="svc" options={options} selectedIds={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "bulk" } });
    expect(screen.getByText(/bulk sms/i)).toBeInTheDocument();
    expect(screen.queryByText(/web development/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith([2]);
  });

  it("shows selected options as removable chips", () => {
    const onChange = vi.fn();
    render(<MultiSelectSearch id="svc" options={options} selectedIds={[1, 3]} onChange={onChange} />);

    expect(screen.getByText("Web Development")).toBeInTheDocument();
    expect(screen.getByText("App Development")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /remove web development/i }));
    expect(onChange).toHaveBeenCalledWith([3]);
  });

  it("closes on an outside click and on Escape", () => {
    render(
      <div>
        <MultiSelectSearch id="svc" options={options} selectedIds={[]} onChange={vi.fn()} />
        <button type="button">outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("acts as a single-pick dropdown when multiple is false: picking an option selects it and closes immediately", () => {
    const onChange = vi.fn();
    render(<MultiSelectSearch id="svc" options={options} selectedIds={[]} onChange={onChange} multiple={false} />);

    fireEvent.click(screen.getByRole("button", { name: /select/i }));
    fireEvent.click(screen.getAllByRole("radio")[0]);

    expect(onChange).toHaveBeenCalledWith([1]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clears every selection with Clear all", () => {
    const onChange = vi.fn();
    render(<MultiSelectSearch id="svc" options={options} selectedIds={[1, 2]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
