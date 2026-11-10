// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RichTextField, { FormattedText } from "./RichTextField";

describe("FormattedText", () => {
  it("renders bold, italic, and code markers as their respective elements", () => {
    render(<FormattedText text="plain **bold** and *italic* and `code`" />);
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("code").tagName).toBe("CODE");
  });
});

describe("RichTextField", () => {
  it("wraps the current selection in ** when Bold is clicked", () => {
    const onChange = vi.fn();
    render(<RichTextField value="hello world" onChange={onChange} />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 5);

    fireEvent.click(screen.getByTitle("Bold"));

    expect(onChange).toHaveBeenCalledWith("**hello** world");
  });
});
