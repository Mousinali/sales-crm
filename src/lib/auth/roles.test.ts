import { describe, it, expect } from "vitest";
import { canManage, creatableRolesFor } from "./roles";

describe("canManage", () => {
  it("lets SUPER_ADMIN manage every role, including itself", () => {
    expect(canManage("SUPER_ADMIN", "SUPER_ADMIN")).toBe(true);
    expect(canManage("SUPER_ADMIN", "HR")).toBe(true);
    expect(canManage("SUPER_ADMIN", "MARKETING_HEAD")).toBe(true);
    expect(canManage("SUPER_ADMIN", "PRE_SALES")).toBe(true);
    expect(canManage("SUPER_ADMIN", "SALESPERSON")).toBe(true);
  });

  it("lets nobody but SUPER_ADMIN create a SUPER_ADMIN", () => {
    expect(canManage("HR", "SUPER_ADMIN")).toBe(false);
    expect(canManage("MARKETING_HEAD", "SUPER_ADMIN")).toBe(false);
    expect(canManage("PRE_SALES", "SUPER_ADMIN")).toBe(false);
    expect(canManage("SALESPERSON", "SUPER_ADMIN")).toBe(false);
  });

  it("lets HR manage only MARKETING_HEAD, PRE_SALES and SALESPERSON", () => {
    expect(canManage("HR", "MARKETING_HEAD")).toBe(true);
    expect(canManage("HR", "PRE_SALES")).toBe(true);
    expect(canManage("HR", "SALESPERSON")).toBe(true);
    expect(canManage("HR", "HR")).toBe(false);
    expect(canManage("HR", "SUPER_ADMIN")).toBe(false);
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
    expect(creatableRolesFor("SUPER_ADMIN")).toEqual(["SUPER_ADMIN", "HR", "MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
    expect(creatableRolesFor("HR")).toEqual(["MARKETING_HEAD", "PRE_SALES", "SALESPERSON"]);
    expect(creatableRolesFor("MARKETING_HEAD")).toEqual(["PRE_SALES", "SALESPERSON"]);
    expect(creatableRolesFor("PRE_SALES")).toEqual([]);
    expect(creatableRolesFor("SALESPERSON")).toEqual([]);
  });
});
