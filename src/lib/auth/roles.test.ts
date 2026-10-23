import { describe, it, expect } from "vitest";
import { canManage, creatableRolesFor } from "./roles";

describe("canManage", () => {
  it("lets SUPER_ADMIN manage only MARKETING_HEAD", () => {
    expect(canManage("SUPER_ADMIN", "MARKETING_HEAD")).toBe(true);
    expect(canManage("SUPER_ADMIN", "PRE_SALES")).toBe(false);
    expect(canManage("SUPER_ADMIN", "SALESPERSON")).toBe(false);
    expect(canManage("SUPER_ADMIN", "SUPER_ADMIN")).toBe(false);
  });

  it("lets MARKETING_HEAD manage only PRE_SALES and SALESPERSON", () => {
    expect(canManage("MARKETING_HEAD", "PRE_SALES")).toBe(true);
    expect(canManage("MARKETING_HEAD", "SALESPERSON")).toBe(true);
    expect(canManage("MARKETING_HEAD", "MARKETING_HEAD")).toBe(false);
    expect(canManage("MARKETING_HEAD", "SUPER_ADMIN")).toBe(false);
  });

  it("lets PRE_SALES and SALESPERSON manage nobody", () => {
    expect(canManage("PRE_SALES", "SALESPERSON")).toBe(false);
    expect(canManage("SALESPERSON", "PRE_SALES")).toBe(false);
  });
});

describe("creatableRolesFor", () => {
  it("returns the exact creatable set per role", () => {
    expect(creatableRolesFor("SUPER_ADMIN")).toEqual(["MARKETING_HEAD"]);
    expect(creatableRolesFor("MARKETING_HEAD")).toEqual(["PRE_SALES", "SALESPERSON"]);
    expect(creatableRolesFor("PRE_SALES")).toEqual([]);
    expect(creatableRolesFor("SALESPERSON")).toEqual([]);
  });
});
