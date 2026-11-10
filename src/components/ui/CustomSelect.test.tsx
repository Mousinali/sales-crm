// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomSelect from "./CustomSelect";

const options = [
  { value: "a", label: "Option A", icon: "/icons/a.svg" },
  { value: "b", label: "Option B" },
];

describe("CustomSelect", () => {
  it("shows the placeholder when nothing is selected, and the matching label (plus icon) once a value is set", () => {
    const { rerender } = render(<CustomSelect value="" onChange={vi.fn()} options={options} placeholder="Pick one" />);
    expect(screen.getByRole("button")).toHaveTextContent("Pick one");

    rerender(<CustomSelect value="a" onChange={vi.fn()} options={options} placeholder="Pick one" />);
    expect(screen.getByRole("button")).toHaveTextContent("Option A");
    expect(screen.getByRole("button").querySelector("img")).toHaveAttribute("src", "/icons/a.svg");
  });

  it("opens on click, lists every option, and calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<CustomSelect value="" onChange={onChange} options={options} />);

    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Option B" }));

    expect(onChange).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on an outside click and on Escape", () => {
    render(
      <div>
        <CustomSelect value="" onChange={vi.fn()} options={options} />
        <button type="button">outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /—/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("only shows a search box once there are enough options to search through, and filters by it", () => {
    render(<CustomSelect value="" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.queryByLabelText(/search options/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Option A" }));

    const manyOptions = Array.from({ length: 10 }, (_, i) => ({ value: String(i), label: `Choice ${i}` }));
    render(<CustomSelect value="" onChange={vi.fn()} options={manyOptions} />);
    fireEvent.click(screen.getAllByRole("button")[1]);

    const search = screen.getByLabelText(/search options/i);
    fireEvent.change(search, { target: { value: "Choice 7" } });
    expect(screen.getByRole("option", { name: "Choice 7" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Choice 2" })).not.toBeInTheDocument();
  });

  it("scrolls the currently selected option into view when opened", () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<CustomSelect value="b" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole("button"));

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(screen.getByRole("option", { name: "Option B" })).toHaveAttribute("aria-selected", "true");
  });
});
