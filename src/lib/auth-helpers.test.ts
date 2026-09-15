import { describe, it, expect } from "vitest";
import { isAdmin, isClientRole } from "./roles";

describe("isAdmin", () => {
  it("is true for SUPER_ADMIN and ADMIN", () => {
    expect(isAdmin("SUPER_ADMIN")).toBe(true);
    expect(isAdmin("ADMIN")).toBe(true);
  });

  it("is false for every portal role", () => {
    expect(isAdmin("OWNER")).toBe(false);
    expect(isAdmin("MANAGER")).toBe(false);
    expect(isAdmin("AGENT")).toBe(false);
    expect(isAdmin("VIEWER")).toBe(false);
    expect(isAdmin("CLIENT")).toBe(false);
  });
});

describe("isClientRole", () => {
  it("is true for every portal (tenant) role", () => {
    expect(isClientRole("OWNER")).toBe(true);
    expect(isClientRole("MANAGER")).toBe(true);
    expect(isClientRole("AGENT")).toBe(true);
    expect(isClientRole("VIEWER")).toBe(true);
    expect(isClientRole("CLIENT")).toBe(true);
  });

  it("is false for platform admin roles", () => {
    expect(isClientRole("SUPER_ADMIN")).toBe(false);
    expect(isClientRole("ADMIN")).toBe(false);
  });
});
