import { describe, it, expect, vi, afterEach } from "vitest";
import { createSmartcardSsoToken, verifySmartcardSsoToken } from "./smartcard-sso";

const SECRET = "test-sso-secret-abc123";
const ORG_ID = "org_abc123";
const EMAIL = "owner@example.com";

afterEach(() => {
  vi.useRealTimers();
});

describe("createSmartcardSsoToken / verifySmartcardSsoToken", () => {
  it("verifies a token it just created", () => {
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, SECRET);
    const result = verifySmartcardSsoToken(token, SECRET);
    expect(result).toEqual({ ok: true, orgId: ORG_ID, email: EMAIL });
  });

  it("rejects a token signed with a different secret", () => {
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, "wrong-secret");
    const result = verifySmartcardSsoToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a tampered payload (org swapped after signing)", () => {
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, SECRET);
    const [payloadB64] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ orgId: "org_someone_else", email: EMAIL, iat: Date.now() }),
      "utf8"
    ).toString("base64url");
    const tampered = `${tamperedPayload}.${token.split(".")[1]}`;
    expect(tampered).not.toBe(token);
    const result = verifySmartcardSsoToken(tampered, SECRET);
    expect(result).toEqual({ ok: false, reason: "bad_signature" });
    void payloadB64;
  });

  it("rejects a malformed token (wrong shape)", () => {
    expect(verifySmartcardSsoToken("not-a-real-token", SECRET)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(verifySmartcardSsoToken("a.b.c", SECRET)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an expired token (older than 60s)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, SECRET);

    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z")); // +65s
    const result = verifySmartcardSsoToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token from slightly in the future beyond clock-skew allowance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, SECRET);

    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z")); // -60s, beyond the 30s skew allowance
    const result = verifySmartcardSsoToken(token, SECRET);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("accepts a token still within the 60s window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = createSmartcardSsoToken(ORG_ID, EMAIL, SECRET);

    vi.setSystemTime(new Date("2026-01-01T00:00:45.000Z")); // +45s
    const result = verifySmartcardSsoToken(token, SECRET);
    expect(result).toEqual({ ok: true, orgId: ORG_ID, email: EMAIL });
  });
});
