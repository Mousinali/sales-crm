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
    fireEvent.change(screen.getByLabelText(/search services/i), { target: { value: "bulk" } });
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
});
