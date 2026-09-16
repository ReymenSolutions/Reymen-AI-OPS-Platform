import { describe, it, expect, vi, afterEach } from "vitest";
import { createWebhookSignature, verifyWebhookSignature, isWebhookAuthorized, isTimestampFresh } from "./webhook-validator";

const SECRET = "test-secret-abc123";
const PAYLOAD = JSON.stringify({ hello: "world" });

function freshTimestamp(): string {
  return Date.now().toString();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isTimestampFresh", () => {
  it("accepts a timestamp from right now", () => {
    expect(isTimestampFresh(Date.now().toString())).toBe(true);
  });

  it("accepts a timestamp within the 5-minute window", () => {
    expect(isTimestampFresh((Date.now() - 4 * 60 * 1000).toString())).toBe(true);
  });

  it("rejects a timestamp older than the 5-minute window (replay)", () => {
    expect(isTimestampFresh((Date.now() - 6 * 60 * 1000).toString())).toBe(false);
  });

  it("accepts a small forward clock-skew allowance", () => {
    expect(isTimestampFresh((Date.now() + 20 * 1000).toString())).toBe(true);
  });

  it("rejects a timestamp too far in the future", () => {
    expect(isTimestampFresh((Date.now() + 60 * 1000).toString())).toBe(false);
  });

  it("rejects garbage, empty, or non-numeric timestamps", () => {
    expect(isTimestampFresh("")).toBe(false);
    expect(isTimestampFresh("not-a-number")).toBe(false);
    expect(isTimestampFresh("-100")).toBe(false);
  });
});

describe("createWebhookSignature / verifyWebhookSignature", () => {
  it("verifies a signature it just created", () => {
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, SECRET, ts);
    expect(verifyWebhookSignature(PAYLOAD, sig, SECRET, ts)).toBe(true);
  });

  it("rejects a signature created with a different secret", () => {
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, "wrong-secret", ts);
    expect(verifyWebhookSignature(PAYLOAD, sig, SECRET, ts)).toBe(false);
  });

  it("rejects a signature for a tampered payload", () => {
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, SECRET, ts);
    expect(verifyWebhookSignature(JSON.stringify({ hello: "mars" }), sig, SECRET, ts)).toBe(false);
  });

  it("rejects a signature verified against a different timestamp than it was signed with (bound to the timestamp)", () => {
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, SECRET, ts);
    const otherTs = (Number(ts) + 1000).toString();
    expect(verifyWebhookSignature(PAYLOAD, sig, SECRET, otherTs)).toBe(false);
  });

  it("rejects a garbage/malformed signature without throwing", () => {
    expect(verifyWebhookSignature(PAYLOAD, "not-a-real-signature", SECRET, freshTimestamp())).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyWebhookSignature(PAYLOAD, "", SECRET, freshTimestamp())).toBe(false);
  });
});

describe("isWebhookAuthorized", () => {
  it("authorizes a valid, fresh HMAC signature regardless of environment", () => {
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, SECRET, ts);
    expect(isWebhookAuthorized(PAYLOAD, sig, "", SECRET, ts)).toBe(true);
  });

  it("CRITICAL: rejects a valid signature paired with a stale (replayed) timestamp", () => {
    const staleTs = (Date.now() - 10 * 60 * 1000).toString();
    const sig = createWebhookSignature(PAYLOAD, SECRET, staleTs);
    expect(isWebhookAuthorized(PAYLOAD, sig, "", SECRET, staleTs)).toBe(false);
  });

  it("rejects a valid signature with a missing timestamp", () => {
    // A signature can only be produced by also picking a timestamp to sign,
    // so this exercises a caller that dropped the header in transit.
    const ts = freshTimestamp();
    const sig = createWebhookSignature(PAYLOAD, SECRET, ts);
    expect(isWebhookAuthorized(PAYLOAD, sig, "", SECRET, "")).toBe(false);
  });

  it("authorizes a matching plain secret outside production, independent of timestamp", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", SECRET, SECRET, "")).toBe(true);
  });

  it("rejects a matching plain secret in production (HMAC-only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isWebhookAuthorized(PAYLOAD, "", SECRET, SECRET, "")).toBe(false);
  });

  it("rejects everything when the known secret is empty", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", "", "", "")).toBe(false);
  });

  it("rejects a wrong plain secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", "wrong", SECRET, "")).toBe(false);
  });
});
