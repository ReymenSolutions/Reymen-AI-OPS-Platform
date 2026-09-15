import { describe, it, expect } from "vitest";
import { generateSlug, generateWebhookSecret, formatDate, formatDateTime, cn } from "./utils";

describe("generateSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(generateSlug("Clínica San Rafael")).toBe("cl-nica-san-rafael");
  });

  it("strips leading and trailing hyphens", () => {
    expect(generateSlug("--Taller Wolf--")).toBe("taller-wolf");
  });

  it("collapses consecutive non-alphanumeric runs into one hyphen", () => {
    expect(generateSlug("A   B---C")).toBe("a-b-c");
  });

  it("handles an all-symbol name without crashing", () => {
    expect(generateSlug("!!!")).toBe("");
  });
});

describe("generateWebhookSecret", () => {
  it("returns a 64-char hex string (32 random bytes)", () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a different value on every call", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toBe(b);
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats a date without throwing", () => {
    expect(formatDate("2026-01-15")).toBeTruthy();
  });

  it("formats a datetime with time components", () => {
    const out = formatDateTime("2026-01-15T10:30:00Z");
    expect(out).toBeTruthy();
  });
});

describe("cn", () => {
  it("merges tailwind classes, letting the later one win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });
});
