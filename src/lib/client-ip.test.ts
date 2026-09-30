import { describe, it, expect, afterEach, vi } from "vitest";
import { clientIp, loginIpRateLimit } from "./client-ip";

const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

describe("clientIp", () => {
  it("CRITICAL: ignores a spoofed first X-Forwarded-For entry and uses the one the proxy appended", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("prefers X-Real-IP, which the proxy overwrites", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.9");
  });

  it("returns null without headers", () => {
    expect(clientIp(req({}))).toBeNull();
    expect(clientIp(undefined)).toBeNull();
  });
});

describe("loginIpRateLimit", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("defaults to 20 and accepts a positive override", () => {
    vi.stubEnv("LOGIN_IP_RATE_LIMIT", "");
    expect(loginIpRateLimit()).toBe(20);
    vi.stubEnv("LOGIN_IP_RATE_LIMIT", "500");
    expect(loginIpRateLimit()).toBe(500);
    vi.stubEnv("LOGIN_IP_RATE_LIMIT", "-3");
    expect(loginIpRateLimit()).toBe(20);
  });
});
