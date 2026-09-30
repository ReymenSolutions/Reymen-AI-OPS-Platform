import { describe, it, expect, afterEach, vi } from "vitest";
import { appUrl, getAppUrl } from "./app-url";

describe("app-url", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses NEXT_PUBLIC_APP_URL at call time, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.reymen.mx/");
    expect(getAppUrl()).toBe("https://app.reymen.mx");
    expect(appUrl("/login")).toBe("https://app.reymen.mx/login");
    expect(appUrl("login")).toBe("https://app.reymen.mx/login");

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://otro.reymen.mx");
    expect(appUrl("/login")).toBe("https://otro.reymen.mx/login");
  });

  it("falls back to localhost when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
