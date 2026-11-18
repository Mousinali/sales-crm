// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DigitsInput from "./DigitsInput";

function Harness() {
  const [v, setV] = useState("");
  return <DigitsInput aria-label="phone" value={v} onValueChange={setV} maxLength={10} />;
}

describe("DigitsInput", () => {
  it("drops letters and symbols, including pasted ones, and caps the length", () => {
    render(<Harness />);
    const input = screen.getByLabelText("phone") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "98a76-5+4 32.1,0xyz99" } });
    expect(input.value).toBe("9876543210");
    fireEvent.change(input, { target: { value: "abc!@#" } });
    expect(input.value).toBe("");
  });
});
