// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavLinks from "./NavLinks";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("NavLinks", () => {
  it("renders a flat item as a direct link", () => {
    render(<NavLinks navItems={[{ href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" }]} />);
    expect(screen.getByRole("link", { name: /dashboard/i })).toHaveAttribute("href", "/dashboard");
  });

  it("renders a group collapsed by default, expanding on click", () => {
    render(
      <NavLinks
        navItems={[
          {
            href: "/leads",
            label: "Leads",
            icon: "ri-contacts-line",
            children: [
              { href: "/leads/new", label: "Add Lead", icon: "ri-add-line" },
              { href: "/leads", label: "Lead List", icon: "ri-list-check" },
            ],
          },
        ]}
      />,
    );
    expect(screen.queryByRole("link", { name: /add lead/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /leads/i }));
    expect(screen.getByRole("link", { name: /add lead/i })).toHaveAttribute("href", "/leads/new");
    expect(screen.getByRole("link", { name: /lead list/i })).toHaveAttribute("href", "/leads");
  });

  it("auto-expands a group when the current route matches one of its children", () => {
    pathname = "/leads/new";
    render(
      <NavLinks
        navItems={[
          {
            href: "/leads",
            label: "Leads",
            icon: "ri-contacts-line",
            children: [
              { href: "/leads/new", label: "Add Lead", icon: "ri-add-line" },
              { href: "/leads", label: "Lead List", icon: "ri-list-check" },
            ],
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /add lead/i })).toBeInTheDocument();
    pathname = "/dashboard";
  });
});
