// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkeletonPage } from "./Skeleton";
import StatTile from "./StatTile";

describe("Skeleton", () => {
  it.each(["table", "dashboard", "detail", "calendar", "chat", "form"] as const)("renders an accessible %s page placeholder", (variant) => {
    render(<SkeletonPage variant={variant} />);
    expect(screen.getByRole("status", { name: "Loading" })).toHaveAttribute("aria-busy", "true");
  });

  it("StatTile hides its value while loading", () => {
    const { rerender } = render(<StatTile label="Total" value={5} icon="ri-x" loading />);
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    rerender(<StatTile label="Total" value={5} icon="ri-x" />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });
});
