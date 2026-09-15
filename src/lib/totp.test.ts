import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, buildOtpauthUri, verifyTotpCode, generateBackupCodes } from "./totp";

describe("generateTotpSecret", () => {
  it("returns a base32 string usable as an OTPAuth secret", () => {
    const secret = generateTotpSecret();
    expect(secret.length).toBeGreaterThan(0);
    expect(() => OTPAuth.Secret.fromBase32(secret)).not.toThrow();
  });

  it("generates a different secret each time", () => {
    expect(generateTotpSecret()).not.toBe(generateTotpSecret());
  });
});

describe("buildOtpauthUri", () => {
  it("embeds the issuer and account email in a valid otpauth:// URI", () => {
    const secret = generateTotpSecret();
    const uri = buildOtpauthUri(secret, "admin@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("Reymen");
    expect(uri).toContain(encodeURIComponent("admin@example.com"));
  });
});

describe("verifyTotpCode", () => {
  it("accepts the current valid code", () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const currentCode = totp.generate();
    expect(verifyTotpCode(secret, currentCode)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const wrongCode = String((Number(totp.generate()) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotpCode(secret, wrongCode)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "not-a-code")).toBe(false);
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "")).toBe(false);
  });

  it("rejects a code generated with a different secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const totpB = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secretB) });
    expect(verifyTotpCode(secretA, totpB.generate())).toBe(false);
  });
});

describe("generateBackupCodes", () => {
  it("generates 8 unique codes in XXXX-XXXX format by default", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}$/);
    }
  });

  it("honors a custom count", () => {
    expect(generateBackupCodes(3)).toHaveLength(3);
  });
});
