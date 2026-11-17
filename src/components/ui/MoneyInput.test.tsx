// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MoneyInput, { formatMoney, groupIndian, toRawMoney } from "./MoneyInput";

describe("Indian money grouping", () => {
  it("groups the last three digits, then pairs", () => {
    expect(groupIndian("100")).toBe("100");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("10000000")).toBe("1,00,00,000");
  });

  it("keeps a half-typed decimal exactly as typed", () => {
    expect(formatMoney("")).toBe("");
    expect(formatMoney("100000")).toBe("1,00,000");
    // A trailing dot and trailing zeros must survive, or the paise can't be typed.
    expect(formatMoney("1000.")).toBe("1,000.");
    expect(formatMoney("1000.50")).toBe("1,000.50");
  });

  it("strips formatting back to a Number()-parseable string", () => {
    expect(toRawMoney("1,00,000", true)).toBe("100000");
    expect(Number(toRawMoney("1,000.50", true))).toBe(1000.5);
    // Stray extra dots would make Number() return NaN.
    expect(toRawMoney("1.000.50", true)).toBe("1.00050");
    expect(toRawMoney("1,000.50", false)).toBe("100050");
  });
});

describe("MoneyInput", () => {
  it("displays grouped text but reports the raw value to the caller", () => {
    const onValueChange = vi.fn();
    render(<MoneyInput aria-label="Budget" value="" onValueChange={onValueChange} />);

    const input = screen.getByLabelText("Budget") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "100000" } });
    expect(onValueChange).toHaveBeenCalledWith("100000");
  });

  it("renders a stored value already grouped", () => {
    render(<MoneyInput aria-label="Budget" value="250000" onValueChange={() => {}} />);
    expect((screen.getByLabelText("Budget") as HTMLInputElement).value).toBe("2,50,000");
  });

  it("is not a number input, which would reject the commas", () => {
    render(<MoneyInput aria-label="Budget" value="1000" onValueChange={() => {}} />);
    expect(screen.getByLabelText("Budget")).toHaveProperty("type", "text");
  });
});
