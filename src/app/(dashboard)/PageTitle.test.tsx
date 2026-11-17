// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PageTitle from "./PageTitle";

let pathname = "/dashboard";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

describe("PageTitle", () => {
  it.each([
    ["/dashboard", "Dashboard"],
    ["/notifications", "Notifications"],
    ["/companies/acme", "Company Details"],
    ["/sales/12", "Sale Details"],
    ["/payments/new", "New Payment"],
    ["/analysis/payments/group", "Payment Analysis"],
    ["/settings", "Settings"],
    ["/some-new-page/3", "Some New Page"],
  ])("titles %s as %s", (path, label) => {
    pathname = path;
    render(<PageTitle />);
    expect(screen.getByRole("heading", { name: label })).toBeInTheDocument();
  });
});
