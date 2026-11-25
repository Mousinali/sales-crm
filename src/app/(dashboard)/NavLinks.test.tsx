// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NavLinks, { NavAccordion } from "./NavLinks";

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

  it("closes the open group when another group (even in another section) is opened", () => {
    const leads = { href: "/leads", label: "Leads", icon: "ri-contacts-line", children: [{ href: "/leads/new", label: "Add Lead", icon: "ri-add-line" }] };
    const sales = { href: "/sales", label: "Sales", icon: "ri-money-dollar-circle-line", children: [{ href: "/sales/new", label: "Add Sale", icon: "ri-add-line" }] };
    render(
      <NavAccordion>
        <NavLinks navItems={[leads]} />
        <NavLinks navItems={[sales]} />
      </NavAccordion>,
    );
    fireEvent.click(screen.getByRole("button", { name: /leads/i }));
    expect(screen.getByRole("link", { name: /add lead/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sales/i }));
    expect(screen.getByRole("link", { name: /add sale/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /add lead/i })).not.toBeInTheDocument();

    // Clicking the open group again closes it, leaving none open.
    fireEvent.click(screen.getByRole("button", { name: /sales/i }));
    expect(screen.queryByRole("link", { name: /add sale/i })).not.toBeInTheDocument();
  });

  it("collapses an open group after navigating to a link outside it", () => {
    pathname = "/dashboard";
    const leads = { href: "/leads", label: "Leads", icon: "ri-contacts-line", children: [{ href: "/leads/new", label: "Add Lead", icon: "ri-add-line" }] };
    const { rerender } = render(
      <NavAccordion>
        <NavLinks navItems={[{ href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" }, leads]} />
      </NavAccordion>,
    );
    // Manually open Leads while on Dashboard.
    fireEvent.click(screen.getByRole("button", { name: /leads/i }));
    expect(screen.getByRole("link", { name: /add lead/i })).toBeInTheDocument();

    // Navigate elsewhere (pathname still outside /leads) — the group collapses.
    pathname = "/calendar";
    rerender(
      <NavAccordion>
        <NavLinks navItems={[{ href: "/dashboard", label: "Dashboard", icon: "ri-dashboard-line" }, leads]} />
      </NavAccordion>,
    );
    expect(screen.queryByRole("link", { name: /add lead/i })).not.toBeInTheDocument();
    pathname = "/dashboard";
  });
});
