import { describe, it, expect, afterEach, vi } from "vitest";
import { getMxnPerUsd, toUsd } from "./currency";

describe("currency", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads a positive MXN_PER_USD and rejects missing or invalid values", () => {
    vi.stubEnv("MXN_PER_USD", "18.25");
    expect(getMxnPerUsd()).toBe(18.25);
    vi.stubEnv("MXN_PER_USD", "");
    expect(getMxnPerUsd()).toBeNull();
    vi.stubEnv("MXN_PER_USD", "abc");
    expect(getMxnPerUsd()).toBeNull();
    vi.stubEnv("MXN_PER_USD", "0");
    expect(getMxnPerUsd()).toBeNull();
  });

  it("converts MXN with the rate, passes USD through, and refuses what it can't convert", () => {
    expect(toUsd(1800, "MXN", 18)).toBe(100);
    expect(toUsd(1800, "mxn", 18)).toBe(100);
    expect(toUsd(100, "USD", null)).toBe(100);
    expect(toUsd(1800, "MXN", null)).toBeNull();
    expect(toUsd(100, "EUR", 18)).toBeNull();
  });
});
