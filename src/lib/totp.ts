import * as OTPAuth from "otpauth";
import { randomBytes } from "crypto";

const ISSUER = "Reymen AI Ops";

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildOtpauthUri(secretBase32: string, accountEmail: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountEmail,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.toString();
}

/**
 * Validates a 6-digit code against the secret, tolerating one time-step of
 * clock drift on either side (±30s).
 */
export function verifyTotpCode(secretBase32: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
  return totp.validate({ token, window: 1 }) !== null;
}

/** Human-friendly single-use recovery codes, e.g. "XZ3K-9QRT". */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}
