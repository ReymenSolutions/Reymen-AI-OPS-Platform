import { describe, it, expect, vi, afterEach } from "vitest";
import { createWebhookSignature, verifyWebhookSignature, isWebhookAuthorized } from "./webhook-validator";

const SECRET = "test-secret-abc123";
const PAYLOAD = JSON.stringify({ hello: "world" });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createWebhookSignature / verifyWebhookSignature", () => {
  it("verifies a signature it just created", () => {
    const sig = createWebhookSignature(PAYLOAD, SECRET);
    expect(verifyWebhookSignature(PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects a signature created with a different secret", () => {
    const sig = createWebhookSignature(PAYLOAD, "wrong-secret");
    expect(verifyWebhookSignature(PAYLOAD, sig, SECRET)).toBe(false);
  });

  it("rejects a signature for a tampered payload", () => {
    const sig = createWebhookSignature(PAYLOAD, SECRET);
    expect(verifyWebhookSignature(JSON.stringify({ hello: "mars" }), sig, SECRET)).toBe(false);
  });

  it("rejects a garbage/malformed signature without throwing", () => {
    expect(verifyWebhookSignature(PAYLOAD, "not-a-real-signature", SECRET)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifyWebhookSignature(PAYLOAD, "", SECRET)).toBe(false);
  });
});

describe("isWebhookAuthorized", () => {
  it("authorizes a valid HMAC signature regardless of environment", () => {
    const sig = createWebhookSignature(PAYLOAD, SECRET);
    expect(isWebhookAuthorized(PAYLOAD, sig, "", SECRET)).toBe(true);
  });

  it("authorizes a matching plain secret outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", SECRET, SECRET)).toBe(true);
  });

  it("rejects a matching plain secret in production (HMAC-only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(isWebhookAuthorized(PAYLOAD, "", SECRET, SECRET)).toBe(false);
  });

  it("rejects everything when the known secret is empty", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", "", "")).toBe(false);
  });

  it("rejects a wrong plain secret", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isWebhookAuthorized(PAYLOAD, "", "wrong", SECRET)).toBe(false);
  });
});
